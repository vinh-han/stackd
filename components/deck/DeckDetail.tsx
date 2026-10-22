"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { exportAnki } from "@/lib/anki";
import { forecast, reviewMinutes, statusCounts, STATUSES } from "@/lib/deck-stats";
import { dayMonth, daysUntil, formatWhen, fromDateInput, plural, startOfDay, toDateInput } from "@/lib/format";
import { isDue, isLeech, topicStats } from "@/lib/scheduler";
import { store, useStore } from "@/lib/store";
import type { Deck, Source, StudyCard } from "@/lib/types";
import { useNow } from "../ClientOnly";
import { Rail } from "../Rail";
import { Sheet } from "../Sheet";
import ui from "../ui.module.css";
import pages from "../pages.module.css";
import styles from "./deck.module.css";

const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "short" });

/** "Vietnamese" for "vi"; the tag itself when the browser does not know it. */
function languageName(tag: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(tag) ?? tag;
  } catch {
    return tag;
  }
}

const leeches = (n: number) => (n === 1 ? "1 leech" : `${n} leeches`);

/** What to do next, at the top; the deck's state, topics and schedule below. The card list lives on /deck/[id]/cards. */
export function DeckDetail({ id }: { id: string }) {
  const state = useStore();
  const tick = useNow();
  // A card reset or added since the last tick is due at once; comparing against the stale tick would hide it.
  const now = useMemo(() => new Date(Math.max(tick.getTime(), Date.now())), [tick, state.cards]);
  const router = useRouter();
  const deck = state.decks.find((d) => d.id === id);

  const [renaming, setRenaming] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  const deckCards = useMemo(() => state.cards.filter((c) => c.deckId === id), [state.cards, id]);
  const due = useMemo(() => deckCards.filter((c) => isDue(c, now)), [deckCards, now]);
  const counts = useMemo(() => statusCounts(deckCards, now), [deckCards, now]);
  const topics = useMemo(() => {
    const dueByTopic = new Map<string, number>();
    for (const c of due) dueByTopic.set(c.topic, (dueByTopic.get(c.topic) ?? 0) + 1);
    return topicStats(deckCards)
      .sort((a, b) => a.mastery - b.mastery)
      .map((t) => ({ ...t, due: dueByTopic.get(t.name) ?? 0 }));
  }, [deckCards, due]);
  const sources = useMemo(() => {
    const perSource = new Map<string, number>();
    for (const c of deckCards) if (c.sourceId) perSource.set(c.sourceId, (perSource.get(c.sourceId) ?? 0) + 1);
    return state.sources.filter((s) => s.deckId === id).map((source) => ({ source, count: perSource.get(source.id) ?? 0 }));
  }, [state.sources, deckCards, id]);

  const reviewHref = `/review?deck=${id}`;
  const cardsHref = `/deck/${id}/cards`;

  // R starts the review, like Space flips a card on the review screen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "r" || e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as HTMLElement).closest("input, textarea, select, [contenteditable]")) return;
      if (settingsOpen || due.length === 0) return;
      e.preventDefault();
      router.push(reviewHref);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settingsOpen, due.length, router, reviewHref]);

  if (!deck) {
    return (
      <div className={ui.app}>
        <main className={ui.main}>
          <div className={pages.page}>
            <h1 className={pages.h1}>Deck not found</h1>
            <p className={pages.lede}>
              It may have been deleted. <Link href="/" className={ui.textBtn}>Back to decks</Link>
            </p>
          </div>
        </main>
      </div>
    );
  }

  const total = deckCards.length;
  const minutes = reviewMinutes(due.length);
  const dueLeeches = due.filter(isLeech).length;
  const nextDue = deckCards.reduce<Date | null>((min, c) => (!c.suspended && (!min || c.srs.due < min) ? c.srs.due : min), null);
  const counted = counts.due + counts.learning + counts.new + counts.known;

  const doExport = () => {
    setExportError(null);
    exportAnki(deck, deckCards).catch((err: Error) => setExportError(err.message));
  };

  const deleteDeck = () => {
    if (!window.confirm(`Delete "${deck.name}" and its ${plural(total, "card")}? This cannot be undone.`)) return;
    store.deleteDeck(deck.id);
    router.replace("/");
  };

  const examDays = deck.examDate ? daysUntil(deck.examDate, now) : null;
  const desktopMeta = [plural(total, "card"), plural(topics.length, "topic"), sources.length > 0 && plural(sources.length, "source")];
  const mobileMeta = [plural(total, "card"), examDays !== null && `${plural(examDays, "day")} to exam`];

  return (
    <div className={ui.app} style={{ "--accent-h": deck.accentHue } as CSSProperties} data-accent>
      <Rail state={state} now={now} activeDeckId={deck.id} showGoal={false} />
      <main className={ui.main}>
        <header className={`${styles.topbar} ${ui.desktopOnly}`}>
          <Link href="/" className={styles.crumb}>
            Decks
          </Link>
          <span className={styles.crumbSep}>/</span>
          <span className={styles.crumbHere}>{deck.name}</span>
          <span className={pages.grow} />
          {total > 0 && (
            <button type="button" className={ui.chip} onClick={doExport}>
              Export to Anki
            </button>
          )}
          <button type="button" className={ui.chip} onClick={() => setRenaming(true)}>
            Rename
          </button>
        </header>
        <header className={`${styles.mHead} ${ui.mobileOnly}`}>
          <Link href="/" className={`${styles.mBack} ${ui.tap}`}>
            Decks
          </Link>
          <span className={pages.grow} />
          <button type="button" className={`${ui.chip} ${ui.tap} ${styles.mHeadChip}`} onClick={() => setSettingsOpen(true)}>
            Settings
          </button>
        </header>

        <div className={pages.scroll}>
          <div className={styles.overview}>
            <div className={styles.mainCol}>
              <section>
                {renaming ? (
                  <RenameInput deck={deck} onDone={() => setRenaming(false)} />
                ) : (
                  <h1 className={`${pages.h1} ${styles.title}`}>{deck.name}</h1>
                )}
                <div className={`${styles.meta} ${ui.desktopOnly}`}>{desktopMeta.filter(Boolean).join(" / ").toUpperCase()}</div>
                <div className={`${styles.meta} ${ui.mobileOnly}`}>{mobileMeta.filter(Boolean).join(" / ").toUpperCase()}</div>
                {exportError && (
                  <div className={`${pages.notice} ${pages.noticeError}`} role="alert" style={{ marginTop: 16 }}>
                    {exportError}
                  </div>
                )}
              </section>

              <section className={styles.dueCard}>
                <div className={styles.dueTop}>
                  {total === 0 ? (
                    <div>
                      <div className={styles.dueTitle}>No cards yet</div>
                      <div className={styles.dueSub}>Paste notes or upload a file to make the first ones.</div>
                    </div>
                  ) : due.length === 0 ? (
                    <div>
                      <div className={styles.dueTitle}>Nothing due now</div>
                      <div className={styles.dueSub}>{nextDue ? `Next review ${formatWhen(nextDue, now)}.` : "Every card is suspended."}</div>
                    </div>
                  ) : (
                    <div>
                      <div className={styles.dueTitle}>
                        <span className={ui.desktopOnly}>{plural(due.length, "card")} due now</span>
                        <span className={ui.mobileOnly}>{due.length} due now</span>
                      </div>
                      <div className={styles.dueSub}>
                        About {plural(minutes, "minute")}
                        <span className={ui.desktopOnly}>
                          .{dueLeeches > 0 && ` Includes ${leeches(dueLeeches)} worth a rewrite.`}
                        </span>
                      </div>
                    </div>
                  )}
                  <div className={`${styles.dueActions} ${ui.desktopOnly}`}>
                    {due.length > 0 && (
                      <Link href={reviewHref} className={`${ui.primaryBtn} ${styles.reviewBtn}`}>
                        Review {due.length} <span className={ui.kbd}>R</span>
                      </Link>
                    )}
                    {total === 0 ? (
                      <Link href={`/add?deck=${deck.id}`} className={`${ui.primaryBtn} ${styles.reviewBtn}`}>
                        Add cards
                      </Link>
                    ) : (
                      <Link href={cardsHref} className={`${ui.outlineBtn} ${styles.browseBtn}`}>
                        Browse all {total}
                      </Link>
                    )}
                  </div>
                </div>
                {counted > 0 && (
                  <>
                    <div className={styles.stack} role="img" aria-label={STATUSES.map((s) => `${s.label} ${counts[s.key]}`).join(", ")}>
                      {STATUSES.filter((s) => counts[s.key] > 0).map((s) => (
                        <div key={s.key} className={styles[`seg_${s.key}`]} style={{ flex: `${counts[s.key]} 1 0` }} />
                      ))}
                    </div>
                    <div className={styles.legend}>
                      {STATUSES.map((s) => (
                        <span key={s.key} className={styles.legendItem}>
                          <span className={`${styles.swatch} ${styles[`seg_${s.key}`]}`} />
                          {s.label} <b className={styles.legendNum}>{counts[s.key]}</b>
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </section>

              {topics.length > 0 && (
                <section>
                  <div className={styles.sectionHead}>
                    <h2 className={styles.label}>TOPICS, WEAKEST FIRST</h2>
                    <span className={`${styles.hint} ${ui.desktopOnly}`}>Click a topic to review only that</span>
                  </div>
                  <div className={styles.topicList}>
                    {topics.map((t, i) => (
                      <Link
                        key={t.name}
                        href={`/review?deck=${deck.id}&topic=${encodeURIComponent(t.name)}`}
                        className={`${styles.topicRow} ${i === 0 && topics.length > 1 ? styles.topicWeak : ""}`}
                      >
                        <span className={styles.topicName}>
                          {t.name}
                          {t.due > 0 && <span className={`${styles.topicDue} ${ui.mobileOnly}`}>{t.due} due</span>}
                        </span>
                        <span className={`${styles.topicCount} ${ui.desktopOnly}`}>{t.count}</span>
                        <div className={ui.bar}>
                          <div className={ui.barFill} style={{ width: `${t.mastery}%` }} />
                        </div>
                        <span className={styles.topicPct}>{t.mastery}%</span>
                        <span className={`${styles.topicAction} ${t.due === 0 ? styles.topicIdle : ""} ${ui.desktopOnly}`}>
                          {t.due > 0 ? `Review ${t.due}` : "None due"}
                        </span>
                      </Link>
                    ))}
                  </div>
                </section>
              )}
            </div>

            <aside className={`${styles.side} ${ui.desktopOnly}`}>
              <Forecast cards={deckCards} now={now} />
              <DeckSettings deck={deck} now={now} sources={sources} onDelete={deleteDeck} />
            </aside>
          </div>
        </div>

        <div className={`${styles.dock} ${ui.mobileOnly}`}>
          {due.length > 0 ? (
            <Link href={reviewHref} className={`${ui.primaryBtn} ${styles.dockBtn}`}>
              Review {due.length}
            </Link>
          ) : total === 0 ? (
            <Link href={`/add?deck=${deck.id}`} className={`${ui.primaryBtn} ${styles.dockBtn}`}>
              Add cards
            </Link>
          ) : null}
          {total > 0 && (
            <Link href={cardsHref} className={styles.dockLink}>
              Browse all {plural(total, "card")}
            </Link>
          )}
        </div>
      </main>

      {settingsOpen && (
        <Sheet title="Deck settings" onClose={closeSettings}>
          <div className={styles.sheetActions}>
            <button
              type="button"
              className={ui.outlineBtn}
              onClick={() => {
                setSettingsOpen(false);
                setRenaming(true);
              }}
            >
              Rename
            </button>
            {total > 0 && (
              <button type="button" className={ui.outlineBtn} onClick={doExport}>
                Export to Anki
              </button>
            )}
          </div>
          <DeckSettings deck={deck} now={now} sources={sources} onDelete={deleteDeck} />
          <div className={ui.sheetActions}>
            <button type="button" className={ui.primaryBtn} onClick={closeSettings}>
              Done
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function RenameInput({ deck, onDone }: { deck: Deck; onDone: () => void }) {
  const cancelled = useRef(false);
  return (
    <input
      className={`${pages.h1} ${pages.titleInput} ${styles.title}`}
      defaultValue={deck.name}
      aria-label="Deck name"
      maxLength={200}
      autoFocus
      onFocus={(e) => e.target.select()}
      onBlur={(e) => {
        const name = e.target.value.trim();
        if (!cancelled.current && name && name !== deck.name) store.updateDeck(deck.id, { name });
        onDone();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") cancelled.current = true;
        if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur();
      }}
    />
  );
}

/** Cards falling due on each of the next 7 days, so the scheduler's plan is visible. */
function Forecast({ cards, now }: { cards: StudyCard[]; now: Date }) {
  const days = useMemo(() => forecast(cards, now), [cards, now]);
  const max = Math.max(1, ...days.map((d) => d.count));
  return (
    <section className={styles.box}>
      <h2 className={styles.label}>NEXT 7 DAYS</h2>
      <div className={styles.bars}>
        {days.map((d, i) => (
          <div key={i} className={`${styles.barCol} ${i === 0 ? styles.barToday : ""}`}>
            <span className={styles.barNum}>{d.count}</span>
            {/* Tallest bar at 70%, leaving room for its number. */}
            <div style={{ height: `${(d.count / max) * 70}%` }} />
          </div>
        ))}
      </div>
      <div className={styles.days}>
        {days.map((d, i) => (
          <span key={i} className={i === 0 ? styles.dayToday : undefined}>
            {weekday.format(d.day)}
          </span>
        ))}
      </div>
    </section>
  );
}

interface SettingsProps {
  deck: Deck;
  now: Date;
  sources: { source: Source; count: number }[];
  onDelete: () => void;
}

/** Exam date, card language, sources and delete: the side column on desktop, the Settings sheet on mobile. */
function DeckSettings({ deck, now, sources, onDelete }: SettingsProps) {
  const [editingDate, setEditingDate] = useState(false);
  const [editingLang, setEditingLang] = useState(false);
  const exam = deck.examDate;
  const past = exam && startOfDay(exam) < startOfDay(now);
  const days = exam ? daysUntil(exam, now) : 0;

  return (
    <>
      <div className={styles.exam}>
        {editingDate ? (
          <label className={`${ui.field} ${styles.examMain}`}>
            <span className={ui.fieldLabel}>EXAM DATE</span>
            <input
              type="date"
              className={ui.input}
              autoFocus
              defaultValue={toDateInput(exam)}
              onChange={(e) => store.updateDeck(deck.id, { examDate: fromDateInput(e.target.value) })}
              onBlur={() => setEditingDate(false)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === "Escape") && e.currentTarget.blur()}
            />
          </label>
        ) : (
          <>
            <div className={styles.examMain}>
              <div className={styles.examDays}>
                {!exam ? "No exam date" : past ? "Exam passed" : days === 0 ? "Exam today" : `${plural(days, "day")} left`}
              </div>
              <div className={styles.examDate}>{exam ? `Exam on ${dayMonth.format(exam)}` : "Set one to count down to it"}</div>
            </div>
            <button type="button" className={`${ui.textBtn} ${ui.tap} ${styles.sideBtn}`} onClick={() => setEditingDate(true)}>
              {exam ? "Change" : "Set"}
            </button>
          </>
        )}
      </div>

      <div className={styles.info}>
        <div className={styles.infoRow}>
          <span>Card language</span>
          {editingLang ? (
            <input
              className={`${ui.input} ${styles.langInput}`}
              autoFocus
              defaultValue={deck.lang ?? ""}
              placeholder="e.g. vi, fr"
              aria-label="Card language"
              maxLength={10}
              onBlur={(e) => {
                store.updateDeck(deck.id, { lang: e.target.value.trim().toLowerCase() || undefined });
                setEditingLang(false);
              }}
              onKeyDown={(e) => (e.key === "Enter" || e.key === "Escape") && e.currentTarget.blur()}
            />
          ) : (
            <button type="button" className={`${styles.infoValue} ${ui.tap}`} onClick={() => setEditingLang(true)}>
              {deck.lang ? languageName(deck.lang) : "Same as source"}
            </button>
          )}
        </div>
        {sources.length > 0 && (
          <>
            <div className={styles.infoLabel}>SOURCES</div>
            {sources.map(({ source, count }) => (
              <div key={source.id} className={styles.sourceRow}>
                <span className={styles.sourceName}>{source.title}</span>
                <span className={styles.sourceCount}>{count}</span>
              </div>
            ))}
          </>
        )}
      </div>

      <button type="button" className={`${ui.textBtn} ${ui.dangerText} ${ui.tap} ${styles.deleteBtn}`} onClick={onDelete}>
        Delete deck
      </button>
    </>
  );
}
