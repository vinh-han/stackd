"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { plural } from "@/lib/format";
import { GenerationError, generateFromChunks, splitText } from "@/lib/generation/run";
import { MAX_INPUT_CHARS } from "@/lib/generation/types";
import { store, useStore, type NewCard } from "@/lib/store";
import type { Deck, StudyCard } from "@/lib/types";
import { useNow } from "../ClientOnly";
import { Rail } from "../Rail";
import ui from "../ui.module.css";
import styles from "../pages.module.css";

const NEW = "__new__";

type Phase =
  | { kind: "idle" }
  | { kind: "running"; done: number; total: number; cards: number }
  | { kind: "done"; deckId: string; cardIds: string[]; failed: number; total: number }
  | { kind: "error"; message: string; missingKey: boolean };

export function AddCards({ initialDeckId }: { initialDeckId?: string }) {
  const state = useStore();
  const now = useNow();
  const { decks, cards } = state;

  const [deckChoice, setDeckChoice] = useState(() =>
    decks.some((d) => d.id === initialDeckId) ? initialDeckId! : decks[0]?.id ?? NEW,
  );
  const [newDeckName, setNewDeckName] = useState("");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const deck = decks.find((d) => d.id === deckChoice);
  const over = text.length > MAX_INPUT_CHARS;
  const canGenerate = text.trim().length > 0 && !over && phase.kind !== "running";

  /** Picks the existing deck, or creates the new one on first save. */
  const resolveDeck = (lang?: string): Deck => {
    if (deck) {
      if (!deck.lang && lang && lang !== "en") store.updateDeck(deck.id, { lang });
      return deck;
    }
    const created = store.createDeck({ name: newDeckName || title || "Untitled deck", lang: lang && lang !== "en" ? lang : undefined });
    setDeckChoice(created.id);
    return created;
  };

  const generate = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!canGenerate) return;
    const sourceTitle = title.trim() || "Pasted text";
    const deckTopics = deck ? [...new Set(cards.filter((c) => c.deckId === deck.id).map((c) => c.topic))] : [];

    const controller = new AbortController();
    abortRef.current = controller;
    setPhase({ kind: "running", done: 0, total: 0, cards: 0 });

    try {
      const chunks = await splitText(text, controller.signal);
      setPhase({ kind: "running", done: 0, total: chunks.length, cards: 0 });
      const result = await generateFromChunks(
        chunks,
        deckTopics,
        (done, cardsSoFar) => setPhase({ kind: "running", done, total: chunks.length, cards: cardsSoFar }),
        controller.signal,
      );
      if (controller.signal.aborted) return;

      const target = resolveDeck(result.language);
      const source = store.addSource({ deckId: target.id, title: sourceTitle, kind: "text", chunks });
      const newCards: NewCard[] = result.chunks.flatMap((r) =>
        r.cards.map((c) => ({
          deckId: target.id,
          type: c.type,
          topic: c.topic,
          subtopic: c.subtopic ?? undefined,
          front: c.front,
          back: c.back,
          sourceRef: chunks.length > 1 ? `${sourceTitle} §${r.index + 1}` : sourceTitle,
          sourceId: source.id,
          chunkIndex: r.index,
          sourceQuote: c.sourceQuote || undefined,
        })),
      );
      const created = store.addCards(newCards);
      setPhase({ kind: "done", deckId: target.id, cardIds: created.map((c) => c.id), failed: result.failed, total: chunks.length });
      setText("");
      setTitle("");
    } catch (err) {
      if (controller.signal.aborted) return;
      const missingKey = err instanceof GenerationError && err.code === "missing_key";
      setPhase({ kind: "error", message: err instanceof Error ? err.message : "Something went wrong.", missingKey });
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
    setPhase({ kind: "idle" });
  };

  const created = useMemo(
    () => (phase.kind === "done" ? cards.filter((c) => phase.cardIds.includes(c.id)) : []),
    [cards, phase],
  );

  return (
    <div className={ui.app}>
      <Rail state={state} now={now} activeDeckId={deck?.id} />
      <main className={ui.main}>
        <div className={styles.scroll}>
          <div className={styles.page}>
            <div className={styles.topbar}>
              <Link href="/" className={styles.topbarBack}>
                &lsaquo; Back
              </Link>
            </div>

            {phase.kind === "done" ? (
              <Result phase={phase} created={created} decks={decks} onMore={() => setPhase({ kind: "idle" })} />
            ) : (
              <>
                <section>
                  <h1 className={styles.h1}>Add cards</h1>
                  <p className={styles.lede}>Paste notes, a chapter or an article, in any language. Cards come back in the same language.</p>
                </section>

                <form className={styles.form} onSubmit={generate}>
                  <div className={styles.row}>
                    <label className={ui.field}>
                      <span className={ui.fieldLabel}>DECK</span>
                      <select
                        className={`${ui.input} ${styles.select}`}
                        value={deckChoice}
                        onChange={(e) => setDeckChoice(e.target.value)}
                        disabled={phase.kind === "running"}
                      >
                        {decks.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                        <option value={NEW}>New deck…</option>
                      </select>
                    </label>
                    {deckChoice === NEW ? (
                      <label className={ui.field}>
                        <span className={ui.fieldLabel}>NEW DECK NAME</span>
                        <input className={ui.input} value={newDeckName} onChange={(e) => setNewDeckName(e.target.value)} placeholder="e.g. AWS SAA-C03" />
                      </label>
                    ) : (
                      <span />
                    )}
                  </div>

                  <label className={ui.field}>
                    <span className={ui.fieldLabel}>SOURCE TITLE</span>
                    <input
                      className={ui.input}
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="e.g. Chapter 3 notes. Shown on every card so you can trace it back."
                      disabled={phase.kind === "running"}
                    />
                  </label>

                  <label className={ui.field}>
                    <span className={ui.fieldLabel}>TEXT</span>
                    <textarea
                      className={`${ui.textarea} ${styles.pasteArea}`}
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.metaKey || e.ctrlKey) && generate()}
                      placeholder="Paste here…"
                      disabled={phase.kind === "running"}
                      autoFocus
                    />
                  </label>

                  {phase.kind === "running" ? (
                    <div className={styles.progressBlock} role="status">
                      <div className={styles.progressText}>
                        {phase.total === 0
                          ? "Preparing"
                          : phase.done < phase.total
                            ? `Reading section ${Math.min(phase.done + 1, phase.total)} of ${phase.total}`
                            : "Saving"}
                        {phase.cards > 0 && ` · ${plural(phase.cards, "card")} so far`}
                      </div>
                      <div className={styles.progressTrack}>
                        <div className={styles.progressFill} style={{ width: `${phase.total ? (phase.done / phase.total) * 100 : 0}%` }} />
                      </div>
                      <div>
                        <button type="button" className={ui.textBtn} onClick={cancel}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className={styles.formFoot}>
                      <button type="submit" className={ui.primaryBtn} disabled={!canGenerate}>
                        Generate cards
                      </button>
                      <span className={`${styles.counter} ${over ? styles.counterOver : ""}`}>
                        {text.length.toLocaleString("en")} / {MAX_INPUT_CHARS.toLocaleString("en")}
                      </span>
                      <span className={`${styles.counter} ${ui.desktopOnly}`}>ctrl + enter</span>
                    </div>
                  )}

                  {phase.kind === "error" && (
                    <div className={`${styles.notice} ${styles.noticeError}`} role="alert">
                      {phase.missingKey ? (
                        <>
                          Card generation needs a Gemini API key. Add <code>GEMINI_API_KEY=…</code> to <code>.env.local</code> in the
                          project root and restart the backend. You can still write cards by hand below.
                        </>
                      ) : (
                        phase.message
                      )}
                    </div>
                  )}
                </form>

                <ManualCard deckChoice={deckChoice} resolveDeck={() => resolveDeck()} />
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function Result({
  phase,
  created,
  decks,
  onMore,
}: {
  phase: Extract<Phase, { kind: "done" }>;
  created: StudyCard[];
  decks: Deck[];
  onMore: () => void;
}) {
  const deck = decks.find((d) => d.id === phase.deckId);
  const topics = new Set(created.map((c) => c.topic)).size;

  return (
    <>
      <section>
        <h1 className={styles.h1}>{created.length > 0 ? `${plural(created.length, "card")} ready` : "No cards made"}</h1>
        <p className={styles.lede}>
          {created.length > 0
            ? `${plural(topics, "topic")} in ${deck?.name ?? "your deck"}. Remove any that look wrong, or fix them during review.`
            : "Nothing in that text looked worth a card. Try a passage with more facts or definitions."}
          {phase.failed > 0 && ` ${phase.failed} of ${phase.total} sections failed to generate.`}
        </p>
        <div className={styles.actions}>
          {created.length > 0 && (
            <Link href={`/review?deck=${phase.deckId}`} className={ui.primaryBtn} autoFocus>
              Start review
            </Link>
          )}
          <button type="button" className={ui.outlineBtn} onClick={onMore}>
            Add more
          </button>
        </div>
      </section>

      {created.length > 0 && (
        <section>
          <h2 className={styles.sectionLabel}>NEW CARDS</h2>
          <div className={styles.cardList}>
            {created.map((c) => (
              <div key={c.id} className={styles.cardItem}>
                <div className={styles.cardBody}>
                  <div className={styles.cardFront} lang={deck?.lang}>
                    {c.front}
                  </div>
                  <div className={styles.cardBack} lang={deck?.lang}>
                    {c.back}
                  </div>
                  <div className={styles.cardMeta}>
                    {[c.type, c.topic, c.subtopic].filter(Boolean).join(" / ").toUpperCase()}
                  </div>
                </div>
                <div className={styles.cardActions}>
                  <button type="button" className={ui.chip} onClick={() => store.deleteCard(c.id)}>
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function ManualCard({ deckChoice, resolveDeck }: { deckChoice: string; resolveDeck: () => Deck }) {
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [topic, setTopic] = useState("");
  const [added, setAdded] = useState(0);
  const canAdd = front.trim() !== "" && back.trim() !== "";

  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!canAdd) return;
    const deck = resolveDeck();
    store.addCards([
      { deckId: deck.id, type: "qa", topic: topic.trim() || "General", front: front.trim(), back: back.trim(), sourceRef: "written by you" },
    ]);
    setFront("");
    setBack("");
    setAdded((n) => n + 1);
  };

  return (
    <section>
      <h2 className={styles.sectionLabel}>OR WRITE ONE</h2>
      <form className={styles.form} onSubmit={add}>
        <div className={styles.row}>
          <label className={ui.field}>
            <span className={ui.fieldLabel}>FRONT</span>
            <textarea className={ui.textarea} rows={2} value={front} onChange={(e) => setFront(e.target.value)} />
          </label>
          <label className={ui.field}>
            <span className={ui.fieldLabel}>BACK</span>
            <textarea className={ui.textarea} rows={2} value={back} onChange={(e) => setBack(e.target.value)} />
          </label>
        </div>
        <div className={styles.formFoot}>
          <input className={`${ui.input} ${styles.search}`} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Topic (optional)" />
          <button type="submit" className={ui.outlineBtn} disabled={!canAdd}>
            Add card
          </button>
          {added > 0 && (
            <span className={styles.muted}>
              {plural(added, "card")} added.{" "}
              {deckChoice !== NEW && (
                <Link href={`/review?deck=${deckChoice}`} className={ui.textBtn}>
                  Review now
                </Link>
              )}
            </span>
          )}
        </div>
      </form>
    </section>
  );
}
