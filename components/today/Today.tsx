"use client";

import Link from "next/link";
import { useMemo } from "react";
import { State } from "ts-fsrs";
import { reviewMinutes } from "@/lib/deck-stats";
import { dayMonth, daysUntil, formatWhen, plural, startOfDay } from "@/lib/format";
import { deckHref, reviewHref } from "@/lib/links";
import { createSampleData } from "@/lib/sample-data";
import { isDue, isLeech, LEECH_LAPSES, topicStats } from "@/lib/scheduler";
import { liveStreak } from "@/lib/streak";
import { store, useAccount, useStore } from "@/lib/store";
import type { Deck, StudyCard } from "@/lib/types";
import { useNow } from "../ClientOnly";
import { AppShell } from "../shell/AppShell";
import ui from "../ui.module.css";
import pages from "../pages.module.css";
import styles from "./today.module.css";

const dateLabel = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "short" });

interface DeckDay {
  deck: Deck;
  due: number;
  newDue: number;
  weakest?: string;
  next: Date | null;
  total: number;
}

const examIn = (days: number) => (days === 0 ? "Exam today" : `Exam in ${plural(days, "day")}`);

/** Home (designs 4b and 4d): everything due across decks, cards that need a rewrite, the next exam. */
export function Today() {
  const state = useStore();
  const tick = useNow();
  // Cards added since the last tick are due at once; comparing against the stale tick would hide them.
  const now = useMemo(() => new Date(Math.max(tick.getTime(), Date.now())), [tick, state.cards]);
  const account = useAccount();
  const { decks, cards, streak } = state;

  const days = useMemo<DeckDay[]>(() => {
    const byDeck = new Map<string, StudyCard[]>();
    for (const c of cards) {
      const list = byDeck.get(c.deckId);
      if (list) list.push(c);
      else byDeck.set(c.deckId, [c]);
    }
    return decks.map((deck) => {
      const list = byDeck.get(deck.id) ?? [];
      const due = list.filter((c) => isDue(c, now));
      const topics = topicStats(list);
      return {
        deck,
        due: due.length,
        newDue: due.filter((c) => c.srs.state === State.New).length,
        weakest: topics.length > 1 ? topics.reduce((a, b) => (b.mastery < a.mastery ? b : a)).name : undefined,
        next: list.reduce<Date | null>((min, c) => (!c.suspended && (!min || c.srs.due < min) ? c.srs.due : min), null),
        total: list.length,
      };
    });
  }, [decks, cards, now]);

  const totalDue = days.reduce((n, d) => n + d.due, 0);
  const dueDecks = days.filter((d) => d.due > 0).length;
  const nextDue = days.reduce<Date | null>((min, d) => (d.next && d.next > now && (!min || d.next < min) ? d.next : min), null);
  const live = liveStreak(streak, now);
  const leeches = useMemo(() => cards.filter((c) => !c.suspended && isLeech(c)), [cards]);
  const leechDecks = decks.filter((d) => leeches.some((c) => c.deckId === d.id));
  const upcoming = (d: Deck) => !!d.examDate && startOfDay(d.examDate) >= startOfDay(now);
  const exam = decks
    .filter(upcoming)
    .sort((a, b) => a.examDate!.getTime() - b.examDate!.getTime())[0];
  const reviewAll = totalDue > 0 ? reviewHref({ from: "/" }) : undefined;

  /** The trailing sentence: the exam if the deck has one, else the streak. */
  const tail = (d: Deck) =>
    upcoming(d)
      ? examIn(daysUntil(d.examDate!, now))
      : live.days > 0
        ? `${live.days} day streak`
        : "";

  const summary = (d: DeckDay) => {
    if (d.total === 0) return "No cards yet.";
    if (d.due === 0) return `Nothing due.${d.next ? ` Next review ${formatWhen(d.next, now)}.` : ""}`;
    const extra = d.newDue > 0 ? `, ${d.newDue} new` : d.weakest ? `, weakest topic ${d.weakest}` : "";
    const t = tail(d.deck);
    return `${d.due} due${extra}.${t ? ` ${t}.` : ""}`;
  };

  if (decks.length === 0) {
    return (
      <AppShell section="today">
        <div className={pages.scroll}>
          <div className={pages.page}>
            <section className={pages.hero}>
              <h1 className={pages.heroTitle}>Paste anything. Get cards.</h1>
              <p className={pages.lede}>
                Notes, a chapter, an article, in any language. Stackd turns it into flashcards, groups them by topic and
                schedules each one for review right before you would forget it.
              </p>
              <div className={pages.actions}>
                <Link href="/add" className={ui.primaryBtn}>
                  Add your first cards
                </Link>
                <button type="button" className={ui.outlineBtn} onClick={() => store.loadSample(createSampleData(new Date()))}>
                  Try sample decks
                </button>
              </div>
            </section>
          </div>
        </div>
      </AppShell>
    );
  }

  const guestNotice = account?.isGuest && cards.length > 0 && (
    <div className={pages.notice}>
      You&apos;re using a guest account, so your cards live only in this browser.{" "}
      <Link href="/account" className={ui.textBtn}>
        Create an account
      </Link>{" "}
      to keep them and study on any device, or{" "}
      <Link href="/account?mode=signin" className={ui.textBtn}>
        sign in
      </Link>
      .
    </div>
  );

  return (
    <AppShell section="today" reviewHref={reviewAll}>
      <div className={pages.scroll}>
        <div className={styles.page}>
          <header className={styles.head}>
            <div className={styles.headText}>
              <div className={`${styles.date} ${ui.desktopOnly}`}>{dateLabel.format(now).replace(",", "").toUpperCase()}</div>
              <h1 className={styles.h1}>
                {totalDue === 0 ? (
                  "Nothing due today"
                ) : (
                  <>
                    {totalDue} <span className={ui.desktopOnly}>{totalDue === 1 ? "card " : "cards "}</span>due today
                  </>
                )}
              </h1>
              <div className={styles.lede}>
                {totalDue > 0
                  ? `About ${plural(reviewMinutes(totalDue), "minute")} across ${plural(dueDecks, "deck")}.`
                  : nextDue
                    ? `The next review is due ${formatWhen(nextDue, now)}.`
                    : "Add cards to start reviewing."}
              </div>
            </div>
            {reviewAll && (
              <Link href={reviewAll} className={`${ui.primaryBtn} ${styles.reviewAll}`}>
                Review all <span className={`${ui.kbd} ${ui.desktopOnly}`}>R</span>
              </Link>
            )}
          </header>

          {guestNotice}

          {/* Desktop (4b): deck cards on the left, needs fixing and the exam on the right. */}
          <div className={`${styles.grid} ${ui.desktopOnly}`}>
            <section className={styles.col}>
              <h2 className={styles.label}>BY DECK</h2>
              {days.map((d) =>
                d.due > 0 ? (
                  <div key={d.deck.id} className={styles.deckRow}>
                    <div className={styles.deckText}>
                      <div className={styles.deckName}>{d.deck.name}</div>
                      <div className={styles.deckSum}>{summary(d)}</div>
                    </div>
                    <Link href={deckHref(d.deck.id)} className={styles.open}>
                      Open deck
                    </Link>
                    <Link href={reviewHref({ deck: d.deck.id, from: "/" })} className={styles.reviewBtn}>
                      Review {d.due}
                    </Link>
                  </div>
                ) : (
                  <div key={d.deck.id} className={`${styles.deckRow} ${styles.deckIdle}`}>
                    <div className={styles.deckText}>
                      <div className={styles.deckName}>{d.deck.name}</div>
                      <div className={styles.deckSum}>{summary(d)}</div>
                    </div>
                    <Link href={deckHref(d.deck.id)} className={styles.open}>
                      Open deck
                    </Link>
                  </div>
                ),
              )}
            </section>

            <aside className={styles.col}>
              {leeches.length > 0 && (
                <>
                  <h2 className={`${styles.label} ${styles.labelSide}`}>NEEDS FIXING</h2>
                  <div className={styles.fixBox}>
                    <div className={styles.fixText}>
                      {leeches.length === 1 ? "This card" : `These ${leeches.length} cards`} failed {LEECH_LAPSES} or more times. A
                      rewrite usually helps more than another review.
                    </div>
                    {leeches.slice(0, 3).map((c) => (
                      <Link key={c.id} href={`${deckHref(c.deckId, "cards")}?card=${c.id}`} className={styles.fixCard}>
                        {c.front}
                      </Link>
                    ))}
                    {leechDecks.map((d) => (
                      <Link key={d.id} href={`${deckHref(d.id, "cards")}?filter=leech`} className={styles.fixLink}>
                        Open in {d.name} / Cards
                      </Link>
                    ))}
                  </div>
                </>
              )}
              {exam?.examDate && (
                <div className={styles.exam}>
                  <div className={styles.examDays}>
                    {daysUntil(exam.examDate, now) === 0 ? "Exam today" : `${plural(daysUntil(exam.examDate, now), "day")} left`}
                  </div>
                  <div className={styles.examSub}>
                    {exam.name} exam on {dayMonth.format(exam.examDate)}
                  </div>
                </div>
              )}
            </aside>
          </div>

          {/* Phones (4d): one list, each deck with its count, then the cards that need fixing. */}
          <div className={`${styles.mList} ${ui.mobileOnly}`}>
            {/* Only decks with work, as in 4d; the Decks tab lists the rest. With nothing due, every deck shows. */}
            {days.filter((d) => d.due > 0 || totalDue === 0).map((d) => {
              const sub = tail(d.deck) || (d.total === 0 ? "No cards yet" : d.due === 0 ? "Nothing due" : `${d.due} due`);
              return (
                <Link key={d.deck.id} href={deckHref(d.deck.id)} className={styles.mRow}>
                  <span className={styles.mText}>
                    <span className={styles.mName}>{d.deck.name}</span>
                    <span className={styles.mSub}>{sub}</span>
                  </span>
                  <span className={`${styles.mCount} ${d.due === 0 ? styles.mCountZero : ""}`}>{d.due}</span>
                </Link>
              );
            })}
            {leeches.length > 0 && (
              <Link href={`${deckHref(leechDecks[0].id, "cards")}?filter=leech`} className={styles.mRow}>
                <span className={styles.mText}>
                  <span className={styles.mName}>{leeches.length === 1 ? "1 card needs" : `${leeches.length} cards need`} fixing</span>
                  <span className={styles.mSub}>Failed {LEECH_LAPSES} or more times</span>
                </span>
                <span className={styles.mOpen}>Open</span>
              </Link>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
