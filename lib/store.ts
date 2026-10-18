import { useSyncExternalStore } from "react";
import { createEmptyCard, type Grade } from "ts-fsrs";
import { rate } from "./scheduler";
import { EMPTY_STREAK, recordStudy } from "./streak";
import type { Deck, ReviewLog, Source, StudyCard, Streak } from "./types";

/*
 * Local-first store, persisted to IndexedDB (localStorage caps out at ~5 MB, which review logs outgrow).
 * Every read and write goes through here, so swapping in Supabase later touches one file.
 */

export interface StoreState {
  version: 1;
  decks: Deck[];
  cards: StudyCard[];
  sources: Source[];
  reviewLogs: ReviewLog[];
  streak: Streak;
}

const DB_NAME = "stackd";
const DB_STORE = "kv";
const DB_KEY = "state";
const LEGACY_KEY = "stackd:v1";
// Save on the next tick: batches changes made together, but a longer delay loses ratings when the tab closes.
const SAVE_DELAY_MS = 0;
const EMPTY: StoreState = { version: 1, decks: [], cards: [], sources: [], reviewLogs: [], streak: EMPTY_STREAK };
const DATE_KEYS = new Set(["due", "last_review", "examDate", "createdAt", "at"]);
const ACCENT_HUES = [190, 300, 25, 140, 260, 60, 340, 100];

let state: StoreState = EMPTY;
let ready = false;
let loadFailed = false;
let saveFailed = false;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let loading: Promise<void> | undefined;
let dbPromise: Promise<IDBDatabase> | undefined;
let channel: BroadcastChannel | undefined;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Parses the old localStorage format, turning ISO strings back into Dates. */
export function parseLegacy(raw: string): StoreState {
  return JSON.parse(raw, (key, value) => (DATE_KEYS.has(key) && typeof value === "string" ? new Date(value) : value));
}

function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(DB_STORE);
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
  return dbPromise;
}

async function read(): Promise<StoreState | undefined> {
  const req = (await db()).transaction(DB_STORE).objectStore(DB_STORE).get(DB_KEY);
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function write(s: StoreState): Promise<void> {
  const tx = (await db()).transaction(DB_STORE, "readwrite");
  tx.objectStore(DB_STORE).put(s, DB_KEY);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}

async function flush() {
  clearTimeout(saveTimer);
  saveTimer = undefined;
  try {
    // Never write over saved data this tab failed to read.
    if (loadFailed) throw new Error("saved data could not be loaded");
    await write(state);
    channel?.postMessage("saved");
    if (saveFailed) {
      saveFailed = false;
      notify();
    }
  } catch (err) {
    console.error("stackd: could not save", err);
    saveFailed = true;
    notify();
  }
}

/** Loads saved data once per tab, importing the old localStorage copy on first run. */
export function loadStore(): Promise<void> {
  loading ??= (async () => {
    try {
      let saved = await read();
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (!saved && legacy) {
        saved = parseLegacy(legacy);
        await write(saved);
        localStorage.removeItem(LEGACY_KEY);
      }
      if (saved) state = saved;
    } catch (err) {
      console.error("stackd: could not load saved data", err);
      loadFailed = saveFailed = true;
    }
    // shortcut: last write wins across tabs; a tab with an unsaved change keeps its own copy. Fine for one person.
    channel = new BroadcastChannel("stackd");
    channel.onmessage = async () => {
      if (saveTimer) return;
      state = (await read()) ?? state;
      notify();
    };
    // Flush pending changes when the tab is hidden or closed.
    document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && saveTimer && flush());
    ready = true;
    notify();
  })();
  return loading;
}

function setState(update: (s: StoreState) => StoreState) {
  state = update(state);
  notify();
  saveTimer ??= setTimeout(flush, SAVE_DELAY_MS);
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

/** False until saved data has loaded. */
export function useStoreReady(): boolean {
  return useSyncExternalStore(subscribe, () => ready, () => false);
}

/** True while changes are not reaching storage. */
export function useSaveFailed(): boolean {
  return useSyncExternalStore(subscribe, () => saveFailed, () => false);
}

const uid = () => crypto.randomUUID();

export type NewCard = Omit<StudyCard, "id" | "srs" | "createdAt">;

export const store = {
  createDeck(input: { name: string; lang?: string; examDate?: Date }): Deck {
    const s = state;
    const deck: Deck = {
      id: uid(),
      name: input.name.trim() || "Untitled deck",
      accentHue: ACCENT_HUES[s.decks.length % ACCENT_HUES.length],
      lang: input.lang,
      examDate: input.examDate,
      createdAt: new Date(),
    };
    setState((s) => ({ ...s, decks: [...s.decks, deck] }));
    return deck;
  },

  updateDeck(id: string, patch: Partial<Pick<Deck, "name" | "lang" | "examDate">>) {
    setState((s) => ({ ...s, decks: s.decks.map((d) => (d.id === id ? { ...d, ...patch } : d)) }));
  },

  deleteDeck(id: string) {
    setState((s) => ({
      ...s,
      decks: s.decks.filter((d) => d.id !== id),
      cards: s.cards.filter((c) => c.deckId !== id),
      sources: s.sources.filter((src) => src.deckId !== id),
      reviewLogs: s.reviewLogs.filter((l) => l.deckId !== id),
    }));
  },

  addSource(input: Omit<Source, "id" | "createdAt">): Source {
    const source: Source = { ...input, id: uid(), createdAt: new Date() };
    setState((s) => ({ ...s, sources: [...s.sources, source] }));
    return source;
  },

  /** New cards are due immediately: the first review should follow generation within seconds. */
  addCards(cards: NewCard[]): StudyCard[] {
    const now = new Date();
    const created = cards.map((c) => ({ ...c, id: uid(), srs: createEmptyCard(now), createdAt: now }));
    setState((s) => ({ ...s, cards: [...s.cards, ...created] }));
    return created;
  },

  updateCard(id: string, patch: Partial<Pick<StudyCard, "front" | "back" | "topic">>) {
    setState((s) => ({ ...s, cards: s.cards.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  },

  deleteCard(id: string) {
    setState((s) => ({ ...s, cards: s.cards.filter((c) => c.id !== id) }));
  },

  restoreCard(card: StudyCard) {
    setState((s) => (s.cards.some((c) => c.id === card.id) ? s : { ...s, cards: [...s.cards, card] }));
  },

  rateCard(id: string, grade: Grade, now: Date): StudyCard | undefined {
    const card = state.cards.find((c) => c.id === id);
    if (!card) return undefined;
    const updated = { ...card, srs: rate(card.srs, grade, now) };
    setState((s) => ({
      ...s,
      cards: s.cards.map((c) => (c.id === id ? updated : c)),
      reviewLogs: [...s.reviewLogs, { cardId: id, deckId: card.deckId, grade, at: now }],
      streak: recordStudy(s.streak, now),
    }));
    return updated;
  },

  loadSample(data: { decks: Deck[]; cards: StudyCard[] }) {
    setState((s) => ({ ...s, decks: [...s.decks, ...data.decks], cards: [...s.cards, ...data.cards] }));
  },
};
