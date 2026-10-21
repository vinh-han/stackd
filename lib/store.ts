import { useSyncExternalStore } from "react";
import { createEmptyCard, type Card as SrsState, type Grade } from "ts-fsrs";
import { startOfDay } from "./format";
import {
  cardFromRow,
  cardToRow,
  deckFromRow,
  deckPatchToRow,
  deckToRow,
  logFromRow,
  logToRow,
  sourceFromRow,
  sourceToRow,
  srsToJson,
  type CardRow,
  type DeckRow,
  type ReviewLogRow,
  type SourceRow,
} from "./rows";
import { rate } from "./scheduler";
import { EMPTY_STREAK, recordStudy } from "./streak";
import { supabase } from "./supabase";
import type { Deck, ReviewLog, Source, StudyCard, Streak } from "./types";

/*
 * App state, stored in Supabase. Every visitor has an account: a guest (anonymous) one until they sign up,
 * which keeps the same user id, so nothing moves. Changes apply in memory at once, then go to the database
 * as small writes in order. Every read and write of saved data goes through this file.
 */

export interface StoreState {
  decks: Deck[];
  cards: StudyCard[];
  sources: Source[];
  /** Today's ratings only: the dashboard needs no more, and loading years of logs would slow every visit. */
  reviewLogs: ReviewLog[];
  streak: Streak;
}

export interface Account {
  userId: string;
  email?: string;
  isGuest: boolean;
}

const EMPTY: StoreState = { decks: [], cards: [], sources: [], reviewLogs: [], streak: EMPTY_STREAK };
const ACCENT_HUES = [190, 300, 25, 140, 260, 60, 340, 100];
const PAGE = 1000; // Supabase returns at most 1,000 rows per request
const INSERT_BATCH = 500;

let state: StoreState = EMPTY;
let account: Account | null = null;
let ready = false;
let saveFailed = false;
let loading: Promise<void> | undefined;
let writes: Promise<void> = Promise.resolve();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Queues a database write. Writes run one at a time, in order, so a card never lands before its deck. */
function persist(write: () => PromiseLike<{ error: unknown }>) {
  writes = writes
    .then(async () => {
      const { error } = await write();
      if (error) throw error;
    })
    .then(
      () => {
        if (saveFailed) {
          saveFailed = false;
          notify();
        }
      },
      (err) => {
        // shortcut: a failed write is not retried; the banner tells the user to reload. Add an outbox for offline use.
        console.error("stackd: could not save", err);
        saveFailed = true;
        notify();
      },
    );
}

function insertAll(table: string, rows: object[]) {
  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    const batch = rows.slice(i, i + INSERT_BATCH);
    persist(() => supabase.from(table).insert(batch));
  }
}

async function selectAll<T>(table: string, since?: { column: string; from: Date }): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = supabase.from(table).select("*");
    if (since) query = query.gte(since.column, since.from.toISOString());
    const { data, error } = await query.order("id").range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data as T[]));
    if (data.length < PAGE) return rows;
  }
}

async function fetchState(): Promise<StoreState> {
  const [decks, sources, cards, logs, profile] = await Promise.all([
    selectAll<DeckRow>("decks"),
    selectAll<SourceRow>("sources"),
    selectAll<CardRow>("cards"),
    selectAll<ReviewLogRow>("review_logs", { column: "at", from: new Date(startOfDay(new Date())) }),
    supabase.from("profiles").select("streak").maybeSingle(),
  ]);
  if (profile.error) throw profile.error;
  return {
    decks: decks.map(deckFromRow).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
    sources: sources.map(sourceFromRow),
    cards: cards.map(cardFromRow),
    reviewLogs: logs.map(logFromRow),
    streak: (profile.data?.streak as Streak | undefined) ?? EMPTY_STREAK,
  };
}

/** One-time move of data saved by the earlier local-only version (IndexedDB) into the account. */
async function importLocalData(): Promise<boolean> {
  const known = await indexedDB.databases?.();
  if (!known?.some((d) => d.name === "stackd")) return false;
  const local = await new Promise<StoreState | undefined>((resolve) => {
    const open = indexedDB.open("stackd");
    open.onsuccess = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains("kv")) return (db.close(), resolve(undefined));
      const req = db.transaction("kv").objectStore("kv").get("state");
      req.onsuccess = () => (db.close(), resolve(req.result));
      req.onerror = () => (db.close(), resolve(undefined));
    };
    open.onerror = () => resolve(undefined);
  });
  if (!local?.decks?.length) return false;
  insertAll("decks", local.decks.map(deckToRow));
  insertAll("sources", local.sources.map(sourceToRow));
  insertAll("cards", local.cards.map(cardToRow));
  await writes;
  if (saveFailed) return false; // keep the local copy for another try
  indexedDB.deleteDatabase("stackd");
  return true;
}

/** Signs in (as a guest on first visit) and loads the account's data, once per page load. */
export function loadStore(): Promise<void> {
  loading ??= (async () => {
    try {
      let session = (await supabase.auth.getSession()).data.session;
      if (!session) {
        const res = await supabase.auth.signInAnonymously();
        if (res.error) throw res.error;
        session = res.data.session;
      }
      const user = session!.user;
      account = { userId: user.id, email: user.email || undefined, isGuest: !!user.is_anonymous };
      state = await fetchState();
      if (state.decks.length === 0 && (await importLocalData())) state = await fetchState();
    } catch (err) {
      console.error("stackd: could not load", err);
      saveFailed = true;
    }
    ready = true;
    notify();
  })();
  return loading;
}

function setState(update: (s: StoreState) => StoreState) {
  state = update(state);
  notify();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Whole-state hook. Derive with useMemo; the state object only changes on writes. */
export function useStore(): StoreState {
  return useSyncExternalStore(subscribe, () => state, () => EMPTY);
}

/** False until the account and its data have loaded. */
export function useStoreReady(): boolean {
  return useSyncExternalStore(subscribe, () => ready, () => false);
}

/** True while changes are not reaching the database. */
export function useSaveFailed(): boolean {
  return useSyncExternalStore(subscribe, () => saveFailed, () => false);
}

export function useAccount(): Account | null {
  return useSyncExternalStore(subscribe, () => account, () => null);
}

export const auth = {
  /** Turns the guest account into a permanent one. Same user id, so every card stays where it is. */
  async signUp(email: string, password: string): Promise<{ confirmEmail: boolean }> {
    const { data, error } = await supabase.auth.updateUser({ email, password });
    if (error) throw error;
    // With email confirmation on (production), the address only takes effect once the link is clicked.
    const confirmed = data.user.email === email;
    account = { userId: data.user.id, email: confirmed ? email : undefined, isGuest: !confirmed };
    notify();
    return { confirmEmail: !confirmed };
  },

  /** Switches to an existing account. Reloads, so the page shows that account's data. */
  async signIn(email: string, password: string): Promise<void> {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    window.location.assign("/");
  },

  async signOut(): Promise<void> {
    await supabase.auth.signOut();
    window.location.assign("/"); // the next load starts a fresh guest account
  },
};

const uid = () => crypto.randomUUID();

/** Cards imported with progress (from Anki) carry their own SRS state; everything else starts new. */
export type NewCard = Omit<StudyCard, "id" | "srs" | "createdAt"> & { srs?: SrsState };

export const store = {
  createDeck(input: { name: string; lang?: string; examDate?: Date }): Deck {
    const deck: Deck = {
      id: uid(),
      name: input.name.trim() || "Untitled deck",
      accentHue: ACCENT_HUES[state.decks.length % ACCENT_HUES.length],
      lang: input.lang,
      examDate: input.examDate,
      createdAt: new Date(),
    };
    setState((s) => ({ ...s, decks: [...s.decks, deck] }));
    persist(() => supabase.from("decks").insert(deckToRow(deck)));
    return deck;
  },

  updateDeck(id: string, patch: Partial<Pick<Deck, "name" | "lang" | "examDate">>) {
    setState((s) => ({ ...s, decks: s.decks.map((d) => (d.id === id ? { ...d, ...patch } : d)) }));
    persist(() => supabase.from("decks").update(deckPatchToRow(patch)).eq("id", id));
  },

  /** The database deletes the deck's cards, sources and logs with it (on delete cascade). */
  deleteDeck(id: string) {
    setState((s) => ({
      ...s,
      decks: s.decks.filter((d) => d.id !== id),
      cards: s.cards.filter((c) => c.deckId !== id),
      sources: s.sources.filter((src) => src.deckId !== id),
      reviewLogs: s.reviewLogs.filter((l) => l.deckId !== id),
    }));
    persist(() => supabase.from("decks").delete().eq("id", id));
  },

  addSource(input: Omit<Source, "id" | "createdAt">): Source {
    const source: Source = { ...input, id: uid(), createdAt: new Date() };
    setState((s) => ({ ...s, sources: [...s.sources, source] }));
    persist(() => supabase.from("sources").insert(sourceToRow(source)));
    return source;
  },

  /** New cards are due immediately: the first review should follow generation within seconds. */
  addCards(cards: NewCard[]): StudyCard[] {
    const now = new Date();
    const created = cards.map((c) => ({ ...c, id: uid(), srs: c.srs ?? createEmptyCard<SrsState>(now), createdAt: now }));
    setState((s) => ({ ...s, cards: [...s.cards, ...created] }));
    insertAll("cards", created.map(cardToRow));
    return created;
  },

  updateCard(id: string, patch: Partial<Pick<StudyCard, "front" | "back" | "topic">>) {
    setState((s) => ({ ...s, cards: s.cards.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
    persist(() => supabase.from("cards").update(patch).eq("id", id));
  },

  deleteCard(id: string) {
    setState((s) => ({ ...s, cards: s.cards.filter((c) => c.id !== id) }));
    persist(() => supabase.from("cards").delete().eq("id", id));
  },

  restoreCard(card: StudyCard) {
    if (state.cards.some((c) => c.id === card.id)) return;
    setState((s) => ({ ...s, cards: [...s.cards, card] }));
    persist(() => supabase.from("cards").upsert(cardToRow(card)));
  },

  rateCard(id: string, grade: Grade, now: Date): StudyCard | undefined {
    const card = state.cards.find((c) => c.id === id);
    if (!card) return undefined;
    const updated = { ...card, srs: rate(card.srs, grade, now) };
    const log: ReviewLog = { cardId: id, deckId: card.deckId, grade, at: now };
    const before = state.streak;
    const streak = recordStudy(before, now); // same object when today already counted
    setState((s) => ({
      ...s,
      cards: s.cards.map((c) => (c.id === id ? updated : c)),
      reviewLogs: [...s.reviewLogs, log],
      streak,
    }));
    persist(() => supabase.from("cards").update({ srs: srsToJson(updated.srs), due: updated.srs.due.toISOString() }).eq("id", id));
    persist(() => supabase.from("review_logs").insert(logToRow(log)));
    const userId = account?.userId;
    if (streak !== before && userId) {
      persist(() => supabase.from("profiles").upsert({ user_id: userId, streak, updated_at: now.toISOString() }));
    }
    return updated;
  },

  loadSample(data: { decks: Deck[]; cards: StudyCard[] }) {
    setState((s) => ({ ...s, decks: [...s.decks, ...data.decks], cards: [...s.cards, ...data.cards] }));
    insertAll("decks", data.decks.map(deckToRow));
    insertAll("cards", data.cards.map(cardToRow));
  },
};
