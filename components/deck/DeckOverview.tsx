"use client";

import Link from "next/link";
import { useMemo } from "react";
import { forecast, reviewMinutes, statusCounts, STATUSES } from "@/lib/deck-stats";
import { daysUntil, formatWhen, plural, startOfDay } from "@/lib/format";
import { addHref, deckHref, reviewHref } from "@/lib/links";
import { isDue, isLeech, topicStats } from "@/lib/scheduler";
import { useStore } from "@/lib/store";
import type { StudyCard } from "@/lib/types";
import { useNow } from "../ClientOnly";
import ui from "../ui.module.css";
import pages from "../pages.module.css";
import { DeckFrame, DeckNotFound } from "./DeckFrame";
import styles from "./deck.module.css";

const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "short" });

const leeches = (n: number) => (n === 1 ? "1 leech" : `${n} leeches`);

/** Overview tab: what is due, how each topic is going, and the week ahead. Settings and the card list have their own tabs. */
export function DeckOverview({ id }: { id: string }) {
  const state = useStore();
  const tick = useNow();
  // A card reset or added since the last tick is due at once; comparing against the stale tick would hide it.
  const now = useMemo(() => new Date(Math.max(tick.getTime(), Date.now())), [tick, state.cards]);
  const deck = state.decks.find((d) => d.id === id);

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

  if (!deck) return <DeckNotFound />;

  const from = deckHref(id);
  const reviewLink = reviewHref({ deck: id, from });
  const total = deckCards.length;
  const minutes = reviewMinutes(due.length);
  const dueLeeches = due.filter(isLeech).length;
  const nextDue = deckCards.reduce<Date | null>((min, c) => (!c.suspended && (!min || c.srs.due < min) ? c.srs.due : min), null);
  const counted = counts.due + counts.learning + counts.new + counts.known;
  const exam = deck.examDate && startOfDay(deck.examDate) >= startOfDay(now) ? daysUntil(deck.examDate, now) : null;
  const examNote = exam === null ? "" : exam === 0 ? " Exam today." : ` Exam in ${plural(exam, "day")}.`;

  return (
    <DeckFrame deck={deck} tab="overview">
      <div className={pages.scroll}>
        <div className={styles.overview}>
          <div className={styles.mainCol}>
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
                    <div className={styles.dueSub}>
                      {nextDue ? `Next review ${formatWhen(nextDue, now)}.` : "Every card is suspended."}
                      {examNote}
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className={styles.dueTitle}>
                      <span className={ui.desktopOnly}>{plural(due.length, "card")} due now</span>
                      <span className={ui.mobileOnly}>{due.length} due now</span>
                    </div>
                    <div className={styles.dueSub}>
                      About {plural(minutes, "minute")}.{examNote}
                      <span className={ui.desktopOnly}>{dueLeeches > 0 && ` Includes ${leeches(dueLeeches)} worth a rewrite.`}</span>
                    </div>
                  </div>
                )}
                {total === 0 && (
                  <div className={`${styles.dueActions} ${ui.desktopOnly}`}>
                    <Link href={addHref(id)} className={`${ui.primaryBtn} ${styles.reviewBtn}`}>
                      Add cards
                    </Link>
                  </div>
                )}
              </div>
              {counted > 0 && (
                <>
                  <div className={styles.stack} role="img" aria-label={STATUSES.map((s) => `${s.label} ${counts[s.key]}`).join(", ")}>
                    {STATUSES.filter((s) => counts[s.key] > 0).map((s) => (
                      <div key={s.key} className={styles[`seg_${s.key}`]} style={{ flex: `${counts[s.key]} 1 0` }} />
                    ))}
                  </div>
                  <div className={`${styles.legend} ${ui.desktopOnly}`}>
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
                  <h2 className={styles.label}>
                    <span className={ui.desktopOnly}>TOPICS, WEAKEST FIRST</span>
                    <span className={ui.mobileOnly}>WEAKEST TOPICS</span>
                  </h2>
                  <span className={`${styles.hint} ${ui.desktopOnly}`}>Click a topic to review only that</span>
                </div>
                <div className={styles.topicList}>
                  {topics.map((t, i) => (
                    <Link
                      key={t.name}
                      href={reviewHref({ deck: id, topic: t.name, from })}
                      className={`${styles.topicRow} ${i === 0 && topics.length > 1 ? styles.topicWeak : ""}`}
                    >
                      <span className={styles.topicName}>{t.name}</span>
                      <span className={`${styles.topicCount} ${ui.desktopOnly}`}>{t.count}</span>
                      <div className={`${ui.bar} ${ui.desktopOnly}`}>
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
          </aside>
        </div>
      </div>

      {(due.length > 0 || total === 0) && (
        <div className={`${styles.dock} ${ui.mobileOnly}`}>
          <Link href={due.length > 0 ? reviewLink : addHref(id)} className={`${ui.primaryBtn} ${styles.dockBtn}`}>
            {due.length > 0 ? `Review ${due.length}` : "Add cards"}
          </Link>
        </div>
      )}
    </DeckFrame>
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
