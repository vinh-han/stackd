"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { Grade } from "ts-fsrs";
import { formatWhen, daysUntil, plural, startOfDay } from "@/lib/format";
import { GRADES, RELEARN_WINDOW_MS, previewIntervals, topicStats, type TopicStat } from "@/lib/scheduler";
import { store, useStore } from "@/lib/store";
import type { Deck, StudyCard } from "@/lib/types";
import { EditSheet } from "../EditSheet";
import { Rail } from "../Rail";
import { SourceSheet } from "../SourceSheet";
import ui from "../ui.module.css";
import styles from "./review.module.css";

const DAY = 24 * 60 * 60 * 1000;
const AHEAD_WINDOW_MS = 7 * DAY;
const UNDO_MS = 6000;

interface Session {
  queue: string[];
  total: number;
  done: number;
  reviewed: number;
  startedAt: number;
}

function cardsDue(cards: StudyCard[], deckId: string, now: Date): string[] {
  return cards
    .filter((c) => c.deckId === deckId && c.srs.due <= now)
    .sort((a, b) => a.srs.due.getTime() - b.srs.due.getTime())
    .map((c) => c.id);
}

/** Cards due within the next week, skipping any already reviewed today. */
function cardsAhead(cards: StudyCard[], deckId: string, now: Date): string[] {
  const limit = now.getTime() + AHEAD_WINDOW_MS;
  const today = startOfDay(now);
  return cards
    .filter(
      (c) =>
        c.deckId === deckId &&
        c.srs.due > now &&
        c.srs.due.getTime() <= limit &&
        (!c.srs.last_review || c.srs.last_review.getTime() < today),
    )
    .sort((a, b) => a.srs.due.getTime() - b.srs.due.getTime())
    .map((c) => c.id);
}

function newSession(cards: StudyCard[], deckId: string, now: Date, ahead = false): Session {
  const queue = ahead ? cardsAhead(cards, deckId, now) : cardsDue(cards, deckId, now);
  return { queue, total: queue.length, done: 0, reviewed: 0, startedAt: now.getTime() };
}

export function ReviewScreen({ deck }: { deck: Deck }) {
  const state = useStore();
  const { cards } = state;

  const [now, setNow] = useState(() => new Date());
  const [session, setSession] = useState<Session>(() => newSession(cards, deck.id, now));
  const [flipped, setFlipped] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [sheet, setSheet] = useState<"edit" | "source" | null>(null);
  const [undo, setUndo] = useState<StudyCard | null>(null);
  const [lastTopic, setLastTopic] = useState<string | null>(null);

  const deckCards = useMemo(() => cards.filter((c) => c.deckId === deck.id), [cards, deck.id]);
  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  // Skip queued cards deleted elsewhere (deck page, another tab).
  const current = session.queue.map((id) => byId.get(id)).find((c) => c !== undefined);
  const intervals = useMemo(() => (current ? previewIntervals(current.srs, now) : null), [current, now]);

  const topics = useMemo(() => topicStats(deckCards), [deckCards]);

  const resetCard = () => {
    setFlipped(false);
    setExpanded(false);
    setSheet(null);
  };

  const flip = useCallback(() => {
    setNow(new Date());
    setFlipped(true);
  }, []);

  const onRate = useCallback(
    (grade: Grade) => {
      if (!current || !flipped) return;
      const t = new Date();
      const updated = store.rateCard(current.id, grade, t);
      if (!updated) return;
      const relearn = updated.srs.due.getTime() - t.getTime() < RELEARN_WINDOW_MS;
      setSession((s) => ({
        ...s,
        queue: [...s.queue.filter((id) => id !== current.id), ...(relearn ? [current.id] : [])],
        done: s.done + (relearn ? 0 : 1),
        reviewed: s.reviewed + 1,
      }));
      setNow(t);
      setLastTopic(current.topic);
      setUndo(null);
      resetCard();
    },
    [current, flipped],
  );

  const onDelete = () => {
    if (!current) return;
    store.deleteCard(current.id);
    setSession((s) => ({ ...s, queue: s.queue.filter((id) => id !== current.id), total: s.total - 1 }));
    setUndo(current);
    resetCard();
  };

  const onUndo = () => {
    if (!undo) return;
    store.restoreCard(undo);
    setSession((s) => ({ ...s, queue: [undo.id, ...s.queue], total: s.total + 1 }));
    setUndo(null);
    resetCard();
  };

  const reviewAhead = () => {
    const t = new Date();
    setNow(t);
    setSession(newSession(cards, deck.id, t, true));
    resetCard();
  };

  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [undo]);

  // Keyboard first: Space flips, 1 to 4 rates.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (sheet || !current || e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as HTMLElement).closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === " ") {
        e.preventDefault();
        if (!flipped) flip();
        return;
      }
      const match = flipped && GRADES.find((g) => g.key === e.key);
      if (match) {
        e.preventDefault();
        onRate(match.grade);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheet, current, flipped, flip, onRate]);

  // Long answers clamp; Expand only appears when the clamp actually cuts text.
  const answerRef = useRef<HTMLParagraphElement>(null);
  const [clamped, setClamped] = useState(false);
  useLayoutEffect(() => {
    const el = answerRef.current;
    if (!el || expanded) return;
    const measure = () => setClamped(el.scrollHeight > el.clientHeight + 1);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [current?.id, current?.back, flipped, expanded]);

  const progress = !current || session.total === 0 ? 1 : session.done / session.total;
  const accentStyle = { "--accent-h": deck.accentHue } as CSSProperties;
  const closeSheet = useCallback(() => setSheet(null), []);

  return (
    <div className={ui.app} style={accentStyle} data-accent>
      <Rail state={state} now={now} activeDeckId={deck.id}>
        {current && topics.length > 0 && (
          <div className={ui.railGroup}>
            <div className={ui.railLabel}>TOPICS</div>
            {topics.map((t) => (
              <div key={t.name} className={ui.topicItem}>
                <span>{t.name}</span>
                <span className={ui.topicValue}>{t.mastery}%</span>
              </div>
            ))}
          </div>
        )}
      </Rail>

      <main className={ui.main}>
        <header className={styles.header}>
          <Link href="/" className={styles.back} aria-label="Back">
            <span className={ui.mobileOnly} aria-hidden>
              &lsaquo;
            </span>
            <span className={ui.desktopOnly}>Back</span>
          </Link>
          <div className={styles.titleBlock}>
            <Link href={`/deck/${deck.id}`} className={styles.title}>
              {deck.name}
            </Link>
            <div className={styles.dueCount}>{current ? `${session.done} / ${session.total} due` : "0 due"}</div>
          </div>
          <div className={styles.spacer} />
          {current && (
            <div className={styles.headerActions}>
              <button type="button" className={ui.chip} onClick={() => setSheet("edit")}>
                Edit<span className={ui.desktopOnly}> card</span>
              </button>
              <button type="button" className={ui.chip} onClick={onDelete}>
                Delete
              </button>
            </div>
          )}
        </header>

        <div className={styles.progress} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
          <div className={styles.progressFill} style={{ width: `${progress * 100}%` }} />
        </div>

        {current && intervals ? (
          <>
            <div className={styles.stage} onClick={flipped ? undefined : flip}>
              <article className={`${styles.card} ${expanded ? styles.cardExpanded : ""}`}>
                <div className={styles.meta}>
                  <span className={styles.cardType}>{current.type.toUpperCase()}</span>
                  <span className={styles.cardTopic}>
                    {[current.topic, current.subtopic].filter(Boolean).join(" / ").toUpperCase()}
                  </span>
                </div>
                {/* The question never moves on flip: it only dims. The answer appears below it. */}
                <p
                  className={`${styles.question} ${current.type === "vocab" ? styles.vocab : ""} ${flipped ? styles.questionDim : ""}`}
                  lang={deck.lang}
                >
                  {current.front}
                </p>
                {flipped && (
                  <>
                    <div className={styles.divider} />
                    <p ref={answerRef} className={`${styles.answer} ${expanded ? "" : styles.answerClamped}`} lang={deck.lang}>
                      {current.back}
                    </p>
                  </>
                )}
                <div className={styles.cardFooter}>
                  {flipped && (clamped || expanded) && (
                    <button type="button" className={ui.ghostBtn} onClick={() => setExpanded((x) => !x)}>
                      {expanded ? "Collapse" : "Expand"}
                    </button>
                  )}
                  {current.sourceId ? (
                    <button
                      type="button"
                      className={styles.source}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSheet("source");
                      }}
                    >
                      source: {current.sourceRef}
                    </button>
                  ) : (
                    <span className={styles.source}>source: {current.sourceRef}</span>
                  )}
                </div>
              </article>
            </div>

            <div className={styles.dock}>
              {flipped ? (
                <>
                  <div className={styles.slot}>
                    <div className={styles.ratings}>
                      {GRADES.map(({ grade, label }) => (
                        <button
                          key={grade}
                          type="button"
                          className={`${styles.rate} ${label === "Good" ? styles.rateGood : ""} ${label === "Easy" ? styles.rateEasy : ""}`}
                          onClick={() => onRate(grade)}
                        >
                          <span className={styles.rateLabel}>{label}</span>
                          <span className={styles.rateInterval}>{intervals[grade]}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className={styles.keys} aria-hidden>
                    {GRADES.map(({ key }) => (
                      <span key={key} className={styles.key}>
                        {key}
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div className={styles.slot}>
                    <button type="button" className={styles.showAnswer} onClick={flip}>
                      Show answer <kbd className={styles.kbd}>SPACE</kbd>
                    </button>
                  </div>
                  <div className={styles.hint}>
                    <span className={ui.desktopOnly}>space to flip, then 1 to 4 to rate</span>
                    <span className={ui.mobileOnly}>tap card or press space to flip</span>
                  </div>
                </>
              )}
            </div>
          </>
        ) : (
          <QueueClear
            deck={deck}
            session={session}
            now={now}
            cards={deckCards}
            topics={topics}
            focusTopic={lastTopic}
            aheadCount={cardsAhead(cards, deck.id, now).length}
            onReviewAhead={reviewAhead}
          />
        )}
      </main>

      {sheet === "edit" && current && (
        <EditSheet
          card={current}
          onSave={(patch) => {
            store.updateCard(current.id, patch);
            setSheet(null);
          }}
          onCancel={closeSheet}
        />
      )}
      {sheet === "source" && current && (
        <SourceSheet card={current} source={state.sources.find((s) => s.id === current.sourceId)} onClose={closeSheet} />
      )}

      {undo && (
        <div className={ui.toast} role="status">
          <span>Card deleted</span>
          <button type="button" className={ui.toastAction} onClick={onUndo}>
            Undo
          </button>
        </div>
      )}
    </div>
  );
}

interface QueueClearProps {
  deck: Deck;
  session: Session;
  now: Date;
  cards: StudyCard[];
  topics: TopicStat[];
  focusTopic: string | null;
  aheadCount: number;
  onReviewAhead: () => void;
}

function QueueClear({ deck, session, now, cards, topics, focusTopic, aheadCount, onReviewAhead }: QueueClearProps) {
  const minutes = Math.max(1, Math.round((now.getTime() - session.startedAt) / 60000));
  const next = cards.reduce<Date | null>((min, c) => (!min || c.srs.due < min ? c.srs.due : min), null);

  const summary = [
    session.reviewed > 0 ? `${plural(session.reviewed, "card")} reviewed in ${plural(minutes, "minute")}.` : "Nothing due right now.",
    next ? `The next batch unlocks ${formatWhen(next, now)}.` : "This deck has no cards yet.",
  ].join(" ");

  const focus = topics.find((t) => t.name === focusTopic) ?? topics[0];
  const weakest = topics.length > 1 ? topics.reduce((a, b) => (b.mastery < a.mastery ? b : a)) : undefined;
  const weakestSource = weakest && cards.find((c) => c.topic === weakest.name)?.sourceRef;
  const addHref = `/add?deck=${deck.id}`;

  return (
    <>
      <div className={styles.clearStage}>
        <div className={styles.clearInner}>
          <div className={styles.clearMain}>
            <div className={styles.ring} />
            <h1 className={styles.clearTitle}>Queue clear</h1>
            <p className={styles.clearText}>{summary}</p>
            <div className={`${styles.clearActions} ${ui.desktopOnly}`}>
              <Link href={addHref} className={ui.primaryBtn}>
                Add cards
              </Link>
              {aheadCount > 0 && (
                <button type="button" className={ui.outlineBtn} onClick={onReviewAhead}>
                  Review {aheadCount} ahead
                </button>
              )}
            </div>
          </div>
          <div className={styles.clearSide}>
            <div className={styles.tiles}>
              {deck.examDate && (
                <div className={`${styles.tile} ${ui.mobileOnly}`}>
                  <div className={styles.tileValue}>{daysUntil(deck.examDate, now)}</div>
                  <div className={styles.tileLabel}>DAYS TO EXAM</div>
                </div>
              )}
              {focus && (
                <div className={styles.tile}>
                  <div className={styles.tileValue}>{focus.mastery}%</div>
                  <div className={styles.tileLabel}>{focus.name.toUpperCase()} MASTERY</div>
                  <div className={`${ui.bar} ${styles.tileBar} ${ui.desktopOnly}`}>
                    <div className={ui.barFill} style={{ width: `${focus.mastery}%` }} />
                  </div>
                </div>
              )}
            </div>
            {weakest && (
              <Link href={addHref} className={styles.weak}>
                <div className={styles.weakTitle}>Weakest topic: {weakest.name}</div>
                <div className={styles.weakBody}>
                  {plural(weakest.count, "card")}, {weakest.mastery}% mastery.
                  {weakestSource && ` Generate more from ${weakestSource}?`}
                </div>
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className={`${styles.dock} ${ui.mobileOnly}`}>
        <div className={styles.slot}>
          <Link href={addHref} className={styles.showAnswer}>
            Add cards
          </Link>
        </div>
        {aheadCount > 0 && (
          <button type="button" className={ui.textBtn} onClick={onReviewAhead}>
            Review {aheadCount} ahead of schedule
          </button>
        )}
      </div>
    </>
  );
}
