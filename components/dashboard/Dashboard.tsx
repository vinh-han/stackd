"use client";

import Link from "next/link";
import { useMemo } from "react";
import { dayKey, liveStreak } from "@/lib/streak";
import { daysUntil, formatWhen, plural } from "@/lib/format";
import { createSampleData } from "@/lib/sample-data";
import { topicStats } from "@/lib/scheduler";
import { store, useStore } from "@/lib/store";
import type { Deck, StudyCard } from "@/lib/types";
import { useNow } from "../ClientOnly";
import { Rail } from "../Rail";
import ui from "../ui.module.css";
import styles from "../pages.module.css";

export function Dashboard() {
  const state = useStore();
  const now = useNow();
  const { decks, cards, reviewLogs, streak } = state;

  const byDeck = useMemo(() => {
    const map = new Map<string, StudyCard[]>();
    for (const c of cards) {
      const list = map.get(c.deckId);
      if (list) list.push(c);
      else map.set(c.deckId, [c]);
    }
    return map;
  }, [cards]);

  const due = cards.filter((c) => c.srs.due <= now);
  const firstDueDeck = decks.find((d) => due.some((c) => c.deckId === d.id));
  const nextDue = cards.reduce<Date | null>((min, c) => (c.srs.due > now && (!min || c.srs.due < min) ? c.srs.due : min), null);
  const today = dayKey(now);
  const reviewedToday = reviewLogs.filter((l) => dayKey(l.at) === today).length;
  const live = liveStreak(streak, now);
  const exam = decks
    .filter((d) => d.examDate && d.examDate.getTime() >= now.getTime() - 86_400_000)
    .sort((a, b) => a.examDate!.getTime() - b.examDate!.getTime())[0];

  return (
    <div className={ui.app}>
      <Rail state={state} now={now} />
      <main className={ui.main}>
        <div className={styles.scroll}>
          <div className={styles.page}>
            <div className={`${styles.topbar} ${ui.mobileOnly}`}>
              <span className={styles.topbarBrand}>Stackd</span>
              <span className={styles.grow} />
              {decks.length > 0 && (
                <Link href="/add" className={ui.chip}>
                  Add cards
                </Link>
              )}
            </div>

            {decks.length === 0 ? (
              <section className={styles.hero}>
                <h1 className={styles.heroTitle}>Paste anything. Get cards.</h1>
                <p className={styles.lede}>
                  Notes, a chapter, an article, in any language. Stackd turns it into flashcards, groups them by topic and
                  schedules each one for review right before you would forget it.
                </p>
                <div className={styles.actions}>
                  <Link href="/add" className={ui.primaryBtn}>
                    Add your first cards
                  </Link>
                  <button type="button" className={ui.outlineBtn} onClick={() => store.loadSample(createSampleData(new Date()))}>
                    Try sample decks
                  </button>
                </div>
              </section>
            ) : (
              <>
                <section>
                  <h1 className={styles.h1}>{due.length > 0 ? `${plural(due.length, "card")} due` : "All caught up"}</h1>
                  <p className={styles.lede}>
                    {due.length > 0
                      ? `Across ${plural(new Set(due.map((c) => c.deckId)).size, "deck")}.`
                      : nextDue
                        ? `The next review is due ${formatWhen(nextDue, now)}.`
                        : "Add cards to start reviewing."}
                  </p>
                  <div className={styles.actions}>
                    {firstDueDeck ? (
                      <Link href={`/review?deck=${firstDueDeck.id}`} className={ui.primaryBtn}>
                        Start review
                      </Link>
                    ) : (
                      <Link href="/add" className={ui.primaryBtn}>
                        Add cards
                      </Link>
                    )}
                  </div>
                </section>

                <section className={styles.tiles}>
                  <div className={styles.tile}>
                    <div className={styles.tileValue}>{live.days}</div>
                    <div className={styles.tileLabel}>DAY STREAK</div>
                    <div className={styles.tileNote}>
                      {live.atRisk ? "Review today to keep it." : `${plural(live.freezes, "freeze")} banked`}
                    </div>
                  </div>
                  <div className={styles.tile}>
                    <div className={styles.tileValue}>{reviewedToday}</div>
                    <div className={styles.tileLabel}>REVIEWED TODAY</div>
                  </div>
                  {exam?.examDate && (
                    <div className={styles.tile}>
                      <div className={styles.tileValue}>{daysUntil(exam.examDate, now)}</div>
                      <div className={styles.tileLabel}>DAYS TO EXAM</div>
                      <div className={styles.tileNote}>{exam.name}</div>
                    </div>
                  )}
                </section>

                <section>
                  <h2 className={styles.sectionLabel}>DECKS</h2>
                  <div className={styles.deckList}>
                    {decks.map((d) => (
                      <DeckCard key={d.id} deck={d} cards={byDeck.get(d.id) ?? []} now={now} />
                    ))}
                  </div>
                </section>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function DeckCard({ deck, cards, now }: { deck: Deck; cards: StudyCard[]; now: Date }) {
  const dueCount = cards.filter((c) => c.srs.due <= now).length;
  const topics = useMemo(() => topicStats(cards).sort((a, b) => a.mastery - b.mastery), [cards]);

  return (
    <article className={styles.deckCard}>
      <div className={styles.deckHead}>
        <Link href={`/deck/${deck.id}`} className={styles.deckTitle}>
          {deck.name}
        </Link>
        <span className={styles.deckMeta}>
          {dueCount} due / {cards.length}
        </span>
      </div>
      {topics.length > 0 ? (
        <div className={styles.topicRows}>
          {/* Weakest first: the point is to show where you are weak. */}
          {topics.slice(0, 4).map((t) => (
            <div key={t.name} className={styles.topicRow}>
              <span className={styles.topicName}>{t.name}</span>
              <div className={ui.bar}>
                <div className={ui.barFill} style={{ width: `${t.mastery}%` }} />
              </div>
              <span className={styles.topicPct}>{t.mastery}%</span>
            </div>
          ))}
          {topics.length > 4 && <span className={styles.muted}>+{topics.length - 4} more topics</span>}
        </div>
      ) : (
        <span className={styles.muted}>No cards yet.</span>
      )}
      <div className={styles.deckFoot}>
        {dueCount > 0 && (
          <Link href={`/review?deck=${deck.id}`} className={`${ui.primaryBtn} ${styles.small}`}>
            Review
          </Link>
        )}
        <Link href={`/add?deck=${deck.id}`} className={`${ui.outlineBtn} ${styles.small}`}>
          Add cards
        </Link>
        {deck.examDate && <span className={styles.muted}>{plural(daysUntil(deck.examDate, now), "day")} to exam</span>}
      </div>
    </article>
  );
}
