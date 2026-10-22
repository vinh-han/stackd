"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Grade } from "ts-fsrs";
import { formatWhen, daysUntil, plural, startOfDay } from "@/lib/format";
import { addHref, deckHref } from "@/lib/links";
import { GRADES, RELEARN_WINDOW_MS, isDue, previewIntervals, topicStats, type TopicStat } from "@/lib/scheduler";
import { store, useStore } from "@/lib/store";
import type { Deck, StudyCard } from "@/lib/types";
import { EditSheet } from "../EditSheet";
import { AppShell } from "../shell/AppShell";
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

/**
 * What a session covers: every deck (nothing set), one deck, one topic of a deck,
 * or exactly the picked cards, due or not (from the Cards tab or search).
 */
export interface ReviewScope {
  deckId?: string;
  topic?: string;
  cardIds?: string[];
}

const inScope = (c: StudyCard, scope: ReviewScope) =>
  (!scope.deckId || c.deckId === scope.deckId) && (!scope.topic || c.topic === scope.topic);

function cardsDue(cards: StudyCard[], now: Date, scope: ReviewScope): string[] {
  if (scope.cardIds) {
    const byId = new Map(cards.map((c) => [c.id, c]));
    return scope.cardIds.filter((id) => {
      const c = byId.get(id);
      return c && inScope(c, scope) && !c.suspended;
    });
  }
  return cards
    .filter((c) => inScope(c, scope) && isDue(c, now))
    .sort((a, b) => a.srs.due.getTime() - b.srs.due.getTime())
    .map((c) => c.id);
}

/** Cards due within the next week, skipping any already reviewed today. */
function cardsAhead(cards: StudyCard[], now: Date, scope: ReviewScope): string[] {
  if (scope.cardIds) return [];
  const limit = now.getTime() + AHEAD_WINDOW_MS;
  const today = startOfDay(now);
  return cards
    .filter(
      (c) =>
        inScope(c, scope) &&
        !c.suspended &&
        c.srs.due > now &&
        c.srs.due.getTime() <= limit &&
        (!c.srs.last_review || c.srs.last_review.getTime() < today),
    )
    .sort((a, b) => a.srs.due.getTime() - b.srs.due.getTime())
    .map((c) => c.id);
}

function newSession(cards: StudyCard[], now: Date, scope: ReviewScope, ahead = false): Session {
  const queue = ahead ? cardsAhead(cards, now, scope) : cardsDue(cards, now, scope);
  return { queue, total: queue.length, done: 0, reviewed: 0, startedAt: now.getTime() };
}

interface Props {
  scope: ReviewScope;
  /** Says what is being reviewed: "All decks", a deck, a topic, "3 selected cards". */
  title: string;
  /** Where Esc and Back return to. */
  from: string;
}

export function ReviewScreen({ scope, title, from }: Props) {
  const state = useStore();
  const { cards, decks } = state;
  const router = useRouter();

  const [now, setNow] = useState(() => new Date());
  const [session, setSession] = useState<Session>(() => newSession(cards, now, scope));
  const [flipped, setFlipped] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [sheet, setSheet] = useState<"edit" | "source" | null>(null);
  const [undo, setUndo] = useState<StudyCard | null>(null);
  const [lastTopic, setLastTopic] = useState<string | null>(null);

  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  // Skip queued cards deleted elsewhere (deck page, another tab).
  const current = session.queue.map((id) => byId.get(id)).find((c) => c !== undefined);
  const [lastDeckId, setLastDeckId] = useState<string | undefined>();
  // A session can mix decks: accent, language and topics follow the card on screen, then the last one rated.
  const deck: Deck =
    decks.find((d) => d.id === (current?.deckId ?? scope.deckId ?? lastDeckId)) ??
    decks.find((d) => cards.some((c) => c.deckId === d.id)) ??
    decks[0];
  const deckCards = useMemo(() => cards.filter((c) => c.deckId === deck.id), [cards, deck.id]);
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
      setLastDeckId(current.deckId);
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
    setSession(newSession(cards, t, scope, true));
    resetCard();
  };

  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [undo]);

  // Keyboard first: Space flips, 1 to 4 rates, Esc goes back to where the review started.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (sheet || e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as HTMLElement).closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "Escape" && !document.querySelector('[aria-modal="true"]')) {
        e.preventDefault();
        router.push(from);
        return;
      }
      if (!current) return;
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
  }, [sheet, current, flipped, flip, onRate, router, from]);

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
  const closeSheet = useCallback(() => setSheet(null), []);

  return (
    <AppShell
      section="review"
      activeDeckId={scope.deckId}
      accentHue={deck.accentHue}
      mobileTop={false}
      tabs={false}
      sidebarExtra={
        current &&
        topics.length > 0 && (
          <div className={styles.railTopics}>
            <div className={styles.railLabel}>TOPICS{scope.deckId ? "" : `, ${deck.name.toUpperCase()}`}</div>
            {topics.map((t) => (
              <div key={t.name} className={styles.railTopic}>
                <span>{t.name}</span>
                <span className={styles.railTopicValue}>{t.mastery}%</span>
              </div>
            ))}
          </div>
        )
      }
    >
        <header className={styles.header}>
          <Link href={from} className={styles.back} aria-label="Back">
            Back
          </Link>
          <div className={styles.titleBlock}>
            {scope.deckId && !scope.topic && !scope.cardIds ? (
              <Link href={deckHref(scope.deckId)} className={styles.title}>
                {title}
              </Link>
            ) : (
              <span className={styles.title}>{title}</span>
            )}
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
            aheadCount={cardsAhead(cards, now, scope).length}
            onReviewAhead={reviewAhead}
          />
        )}

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
    </AppShell>
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
  const next = cards.reduce<Date | null>((min, c) => (!c.suspended && (!min || c.srs.due < min) ? c.srs.due : min), null);

  const summary = [
    session.reviewed > 0 ? `${plural(session.reviewed, "card")} reviewed in ${plural(minutes, "minute")}.` : "Nothing due right now.",
    next ? `The next batch unlocks ${formatWhen(next, now)}.` : "This deck has no cards yet.",
  ].join(" ");

  const focus = topics.find((t) => t.name === focusTopic) ?? topics[0];
  const weakest = topics.length > 1 ? topics.reduce((a, b) => (b.mastery < a.mastery ? b : a)) : undefined;
  const weakestSource = weakest && cards.find((c) => c.topic === weakest.name)?.sourceRef;
  const add = addHref(deck.id);

  return (
    <>
      <div className={styles.clearStage}>
        <div className={styles.clearInner}>
          <div className={styles.clearMain}>
            <div className={styles.ring} />
            <h1 className={styles.clearTitle}>Queue clear</h1>
            <p className={styles.clearText}>{summary}</p>
            <div className={`${styles.clearActions} ${ui.desktopOnly}`}>
              <Link href={add} className={ui.primaryBtn}>
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
              <Link href={add} className={styles.weak}>
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
          <Link href={add} className={styles.showAnswer}>
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
