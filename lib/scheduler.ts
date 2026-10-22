import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card, type Grade } from "ts-fsrs";
import type { StudyCard } from "./types";

// Fuzz off so the interval shown on a button is exactly the interval you get.
const scheduler = fsrs(generatorParameters({ enable_fuzz: false }));

export const GRADES = [
  { grade: Rating.Again, label: "Again", key: "1" },
  { grade: Rating.Hard, label: "Hard", key: "2" },
  { grade: Rating.Good, label: "Good", key: "3" },
  { grade: Rating.Easy, label: "Easy", key: "4" },
] as const satisfies readonly { grade: Grade; label: string; key: string }[];

/** A card forgotten this many times after being learned is a leech: it likely needs a rewrite, not more reviews. */
export const LEECH_LAPSES = 4;

export const isLeech = (card: StudyCard) => card.srs.lapses >= LEECH_LAPSES;

/** In the review queue now. Suspended cards never are. */
export const isDue = (card: StudyCard, now: Date) => !card.suspended && card.srs.due <= now;

/** Cards due again within this window come back later in the same session. */
export const RELEARN_WINDOW_MS = 20 * 60 * 1000;

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function rate(card: Card, grade: Grade, now: Date): Card {
  return scheduler.next(card, now, grade).card;
}

export function previewIntervals(card: Card, now: Date): Record<Grade, string> {
  const preview = scheduler.repeat(card, now);
  const out = {} as Record<Grade, string>;
  for (const { grade } of GRADES) {
    out[grade] = formatInterval(preview[grade].card.due.getTime() - now.getTime());
  }
  return out;
}

export function formatInterval(ms: number): string {
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / MINUTE))}m`;
  if (ms < DAY) return `${Math.round(ms / HOUR)}h`;
  const days = Math.round(ms / DAY);
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1).replace(/\.0$/, "")}y`;
}

/** Days of stability at which a card counts as fully mastered. */
const MASTERED_STABILITY_DAYS = 21;

/** Topic mastery, 0 to 100: mean stability progress toward MASTERED_STABILITY_DAYS. */
export function mastery(cards: Card[]): number {
  if (cards.length === 0) return 0;
  const sum = cards.reduce(
    (acc, c) => acc + (c.state === State.New ? 0 : Math.min(1, c.stability / MASTERED_STABILITY_DAYS)),
    0,
  );
  return Math.round((sum / cards.length) * 100);
}

export interface TopicStat {
  name: string;
  count: number;
  mastery: number;
}

/** Cards grouped by topic, in first-seen order, with mastery per topic. */
export function topicStats(cards: StudyCard[]): TopicStat[] {
  const groups = new Map<string, Card[]>();
  for (const c of cards) {
    const list = groups.get(c.topic);
    if (list) list.push(c.srs);
    else groups.set(c.topic, [c.srs]);
  }
  return [...groups].map(([name, list]) => ({ name, count: list.length, mastery: mastery(list) }));
}

/**
 * Builds a realistic SRS state by replaying a review history,
 * then shifts the timeline so the card falls due `dueInDays` from now.
 */
export function replayHistory(history: Grade[], now: Date, dueInDays: number): Card {
  let card = createEmptyCard(new Date(now.getTime() - 365 * DAY));
  for (const grade of history) {
    card = scheduler.next(card, card.due, grade).card;
  }
  const shift = now.getTime() + dueInDays * DAY - card.due.getTime();
  return {
    ...card,
    due: new Date(card.due.getTime() + shift),
    last_review: card.last_review ? new Date(card.last_review.getTime() + shift) : undefined,
  };
}
