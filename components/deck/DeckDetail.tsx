"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type CSSProperties } from "react";
import { exportAnki } from "@/lib/anki";
import { formatDue, fromDateInput, plural, toDateInput } from "@/lib/format";
import { topicStats } from "@/lib/scheduler";
import { store, useStore } from "@/lib/store";
import type { StudyCard } from "@/lib/types";
import { useNow } from "../ClientOnly";
import { EditSheet } from "../EditSheet";
import { Rail } from "../Rail";
import { SourceSheet } from "../SourceSheet";
import ui from "../ui.module.css";
import styles from "../pages.module.css";

export function DeckDetail({ id }: { id: string }) {
  const state = useStore();
  const now = useNow();
  const router = useRouter();
  const deck = state.decks.find((d) => d.id === id);

  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<StudyCard | null>(null);
  const [viewing, setViewing] = useState<StudyCard | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const deckCards = useMemo(() => state.cards.filter((c) => c.deckId === id), [state.cards, id]);
  const topics = useMemo(() => topicStats(deckCards).sort((a, b) => a.mastery - b.mastery), [deckCards]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? deckCards.filter((c) => `${c.front} ${c.back} ${c.topic}`.toLowerCase().includes(q))
      : deckCards;
    return [...list].sort((a, b) => a.srs.due.getTime() - b.srs.due.getTime());
  }, [deckCards, query]);

  if (!deck) {
    return (
      <div className={ui.app}>
        <main className={ui.main}>
          <div className={styles.page}>
            <h1 className={styles.h1}>Deck not found</h1>
            <p className={styles.lede}>
              It may have been deleted. <Link href="/" className={ui.textBtn}>Back to decks</Link>
            </p>
          </div>
        </main>
      </div>
    );
  }

  const dueCount = deckCards.filter((c) => c.srs.due <= now).length;

  const deleteDeck = () => {
    if (!window.confirm(`Delete "${deck.name}" and its ${plural(deckCards.length, "card")}? This cannot be undone.`)) return;
    store.deleteDeck(deck.id);
    router.replace("/");
  };

  return (
    <div className={ui.app} style={{ "--accent-h": deck.accentHue } as CSSProperties} data-accent>
      <Rail state={state} now={now} activeDeckId={deck.id} />
      <main className={ui.main}>
        <div className={styles.scroll}>
          <div className={styles.page}>
            <div className={styles.topbar}>
              <Link href="/" className={styles.topbarBack}>
                &lsaquo; Back
              </Link>
            </div>

            <section>
              <input
                className={`${styles.h1} ${styles.titleInput}`}
                defaultValue={deck.name}
                aria-label="Deck name"
                onBlur={(e) => e.target.value.trim() && store.updateDeck(deck.id, { name: e.target.value.trim() })}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              />
              <p className={styles.lede}>
                {plural(deckCards.length, "card")}, {dueCount} due now.
              </p>
              <div className={styles.actions}>
                {dueCount > 0 && (
                  <Link href={`/review?deck=${deck.id}`} className={ui.primaryBtn}>
                    Review {dueCount}
                  </Link>
                )}
                <Link href={`/add?deck=${deck.id}`} className={ui.outlineBtn}>
                  Add cards
                </Link>
                {deckCards.length > 0 && (
                  <button
                    type="button"
                    className={ui.outlineBtn}
                    onClick={() => {
                      setExportError(null);
                      exportAnki(deck, deckCards).catch((err: Error) => setExportError(err.message));
                    }}
                  >
                    Export to Anki
                  </button>
                )}
              </div>
              {exportError && (
                <div className={`${styles.notice} ${styles.noticeError}`} role="alert">
                  {exportError}
                </div>
              )}
            </section>

            <section className={styles.row}>
              <label className={ui.field}>
                <span className={ui.fieldLabel}>EXAM OR TARGET DATE</span>
                <input
                  type="date"
                  className={ui.input}
                  value={toDateInput(deck.examDate)}
                  onChange={(e) => store.updateDeck(deck.id, { examDate: fromDateInput(e.target.value) })}
                />
              </label>
              <label className={ui.field}>
                <span className={ui.fieldLabel}>CARD LANGUAGE</span>
                <input
                  className={ui.input}
                  defaultValue={deck.lang ?? ""}
                  placeholder="e.g. vi, fr. Detected from your first paste."
                  maxLength={10}
                  onBlur={(e) => store.updateDeck(deck.id, { lang: e.target.value.trim().toLowerCase() || undefined })}
                />
              </label>
            </section>

            {topics.length > 0 && (
              <section>
                <h2 className={styles.sectionLabel}>TOPIC MASTERY</h2>
                <div className={styles.topicRows}>
                  {topics.map((t) => (
                    <div key={t.name} className={styles.topicRow}>
                      <span className={styles.topicName}>
                        {t.name} <span className={styles.muted}>· {t.count}</span>
                      </span>
                      <div className={ui.bar}>
                        <div className={ui.barFill} style={{ width: `${t.mastery}%` }} />
                      </div>
                      <span className={styles.topicPct}>{t.mastery}%</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section>
              <div className={styles.listHead}>
                <h2 className={styles.sectionLabel}>CARDS</h2>
                <span className={styles.grow} />
                <input
                  className={`${ui.input} ${styles.search}`}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search cards"
                  aria-label="Search cards"
                />
              </div>
              {visible.length === 0 ? (
                <p className={styles.muted}>{deckCards.length === 0 ? "No cards yet." : "No cards match."}</p>
              ) : (
                <div className={styles.cardList}>
                  {visible.map((c) => (
                    <div key={c.id} className={styles.cardItem}>
                      <div className={styles.cardBody}>
                        <div className={styles.cardFront} lang={deck.lang}>
                          {c.front}
                        </div>
                        <div className={styles.cardBack} lang={deck.lang}>
                          {c.back}
                        </div>
                        <div className={styles.cardMeta}>
                          {[c.type, c.topic, c.subtopic].filter(Boolean).join(" / ").toUpperCase()} · DUE{" "}
                          {formatDue(c.srs.due, now).toUpperCase()}
                        </div>
                      </div>
                      <div className={styles.cardActions}>
                        {c.sourceId && (
                          <button type="button" className={ui.chip} onClick={() => setViewing(c)}>
                            Source
                          </button>
                        )}
                        <button type="button" className={ui.chip} onClick={() => setEditing(c)}>
                          Edit
                        </button>
                        <button type="button" className={ui.chip} onClick={() => store.deleteCard(c.id)}>
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className={styles.danger}>
              <button type="button" className={`${ui.textBtn} ${ui.dangerText}`} onClick={deleteDeck}>
                Delete deck
              </button>
            </section>
          </div>
        </div>
      </main>

      {editing && (
        <EditSheet
          card={editing}
          onSave={(patch) => {
            store.updateCard(editing.id, patch);
            setEditing(null);
          }}
          onCancel={() => setEditing(null)}
        />
      )}
      {viewing && (
        <SourceSheet card={viewing} source={state.sources.find((s) => s.id === viewing.sourceId)} onClose={() => setViewing(null)} />
      )}
    </div>
  );
}
