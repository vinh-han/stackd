import { State } from "ts-fsrs";
import { startOfDay } from "./format";
import { isDue, isLeech } from "./scheduler";
import type { StudyCard } from "./types";

const DAY = 24 * 60 * 60 * 1000;

/** Review time estimate per card, for "About 6 minutes". */
export const SECONDS_PER_CARD = 30;

export function reviewMinutes(cards: number): number {
  return Math.max(1, Math.round((cards * SECONDS_PER_CARD) / 60));
}

/**
 * One bucket per card for the deck's stacked bar. New cards count as new even though they are due at once,
 * so "due" means reviews of cards already seen. Suspended cards are left out.
 */
export type CardStatus = "due" | "learning" | "new" | "known";

export const STATUSES: readonly { key: CardStatus; label: string }[] = [
  { key: "due", label: "Due" },
  { key: "learning", label: "Learning" },
  { key: "new", label: "New" },
  { key: "known", label: "Known" },
];

export function statusOf(card: StudyCard, now: Date): CardStatus {
  if (card.srs.state === State.New) return "new";
  if (card.srs.due <= now) return "due";
  if (card.srs.state === State.Learning || card.srs.state === State.Relearning) return "learning";
  return "known";
}

export function statusCounts(cards: StudyCard[], now: Date): Record<CardStatus, number> {
  const counts: Record<CardStatus, number> = { due: 0, learning: 0, new: 0, known: 0 };
  for (const c of cards) if (!c.suspended) counts[statusOf(c, now)]++;
  return counts;
}

/** Cards falling due on each of the next `days` calendar days. Today includes everything overdue. */
export function forecast(cards: StudyCard[], now: Date, days = 7): { day: Date; count: number }[] {
  const out = Array.from({ length: days }, (_, i) => ({
    day: new Date(now.getFullYear(), now.getMonth(), now.getDate() + i),
    count: 0,
  }));
  const today = startOfDay(now);
  for (const c of cards) {
    if (c.suspended) continue;
    const i = Math.max(0, Math.round((startOfDay(c.srs.due) - today) / DAY)); // round: DST days are 23 or 25 h
    if (i < days) out[i].count++;
  }
  return out;
}

export type CardFilter = "all" | "due" | "new" | "leech" | "suspended";

export const FILTERS: readonly { key: CardFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "due", label: "Due" },
  { key: "new", label: "New" },
  { key: "leech", label: "Leech" },
  { key: "suspended", label: "Suspended" },
];

export function matchesFilter(card: StudyCard, filter: CardFilter, now: Date): boolean {
  switch (filter) {
    case "all":
      return true;
    case "due":
      return isDue(card, now);
    case "new":
      return !card.suspended && card.srs.state === State.New;
    case "leech":
      return isLeech(card);
    case "suspended":
      return !!card.suspended;
  }
}

export type CardSort = "hardest" | "due" | "newest";

export const SORTS: readonly { key: CardSort; label: string }[] = [
  { key: "hardest", label: "Hardest first" },
  { key: "due", label: "Due first" },
  { key: "newest", label: "Newest first" },
];

/** Sorted copy. Hardest uses FSRS difficulty (1 to 10); new cards have none yet, so they go last. */
export function sortCards(cards: StudyCard[], sort: CardSort): StudyCard[] {
  const list = [...cards];
  if (sort === "hardest") {
    const d = (c: StudyCard) => (c.srs.state === State.New ? -1 : c.srs.difficulty);
    return list.sort((a, b) => d(b) - d(a) || a.srs.due.getTime() - b.srs.due.getTime());
  }
  if (sort === "due") return list.sort((a, b) => a.srs.due.getTime() - b.srs.due.getTime());
  return list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/** The one tag worth showing instead of a due date, if any. */
export function cardTag(card: StudyCard): "Suspended" | "Leech" | "New" | null {
  if (card.suspended) return "Suspended";
  if (isLeech(card)) return "Leech";
  if (card.srs.state === State.New) return "New";
  return null;
}

/** "Today" (overdue included), "Tomorrow", "in 21d". */
export function dueDay(due: Date, now: Date): string {
  const days = Math.round((startOfDay(due) - startOfDay(now)) / DAY);
  if (days <= 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `in ${days}d`;
}
