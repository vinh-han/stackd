"use client";

import Link from "next/link";
import { useMemo } from "react";
import { dayMonth, daysUntil, plural } from "@/lib/format";
import type { StoreState } from "@/lib/store";
import ui from "./ui.module.css";

interface Props {
  state: StoreState;
  now: Date;
  activeDeckId?: string;
  /** Extra rail sections, rendered between the deck list and the goal card. */
  children?: React.ReactNode;
}

export function Rail({ state, now, activeDeckId, children }: Props) {
  const { decks, cards } = state;
  const dueCounts = useMemo(() => {
    // Cards created after the last clock tick are due "now" too, so never compare against a stale time.
    const at = Math.max(now.getTime(), Date.now());
    const counts: Record<string, number> = {};
    for (const c of cards) if (c.srs.due.getTime() <= at) counts[c.deckId] = (counts[c.deckId] ?? 0) + 1;
    return counts;
  }, [cards, now]);

  // Highlight the active deck's count while it has work; once clear, point at the next deck that does.
  const hot = activeDeckId && dueCounts[activeDeckId] ? activeDeckId : decks.find((d) => dueCounts[d.id])?.id;

  // Goal card: the active deck's exam, else the soonest upcoming one.
  const goal =
    decks.find((d) => d.id === activeDeckId && d.examDate) ??
    decks
      .filter((d) => d.examDate && d.examDate.getTime() >= now.getTime() - 86_400_000)
      .sort((a, b) => a.examDate!.getTime() - b.examDate!.getTime())[0];

  return (
    <aside className={ui.rail}>
      <Link href="/" className={ui.brand}>
        Stackd
      </Link>
      <nav className={ui.railGroup} aria-label="Decks">
        <div className={ui.railLabel}>DECKS</div>
        {decks.map((d) => (
          <Link
            key={d.id}
            href={`/review?deck=${d.id}`}
            className={`${ui.deckItem} ${d.id === activeDeckId ? ui.deckItemActive : ""}`}
            aria-current={d.id === activeDeckId ? "page" : undefined}
          >
            <span className={ui.deckName}>{d.name}</span>
            <span className={`${ui.deckCount} ${d.id === hot ? ui.deckCountHot : ""}`}>{dueCounts[d.id] ?? 0}</span>
          </Link>
        ))}
        <Link href={activeDeckId ? `/add?deck=${activeDeckId}` : "/add"} className={ui.railAdd}>
          + Add cards
        </Link>
      </nav>
      {children}
      {goal?.examDate && (
        <div className={ui.goal}>
          <div className={ui.goalDays}>{plural(daysUntil(goal.examDate, now), "day")} left</div>
          <div className={ui.goalDate}>
            {goal.id === activeDeckId ? "Exam" : goal.name} on {dayMonth.format(goal.examDate)}
          </div>
        </div>
      )}
    </aside>
  );
}
