import type { Streak } from "./types";

/** A freeze is earned every this many consecutive days. */
const FREEZE_EVERY = 7;
const MAX_FREEZES = 2;

export const EMPTY_STREAK: Streak = { current: 0, longest: 0, lastDay: null, freezes: 0 };

export function dayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function daysBetween(fromKey: string, toKey: string): number {
  const [a, b] = [fromKey, toKey].map((k) => {
    const [y, m, d] = k.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  });
  return Math.round((b - a) / 86_400_000);
}

/** Days missed since the last study day, not counting today. */
function missedDays(streak: Streak, now: Date): number {
  if (!streak.lastDay) return 0;
  return Math.max(0, daysBetween(streak.lastDay, dayKey(now)) - 1);
}

/** Streak as shown right now. Missed days are forgiven while freezes cover them. */
export function liveStreak(streak: Streak, now: Date): { days: number; freezes: number; atRisk: boolean } {
  const missed = missedDays(streak, now);
  if (missed > streak.freezes) return { days: 0, freezes: streak.freezes, atRisk: false };
  const studiedToday = streak.lastDay === dayKey(now);
  return { days: streak.current, freezes: streak.freezes - missed, atRisk: !studiedToday && streak.current > 0 };
}

/** Record a review. One bad day must not nuke months of progress, so freezes absorb gaps. */
export function recordStudy(streak: Streak, now: Date): Streak {
  const today = dayKey(now);
  if (streak.lastDay === today) return streak;

  const missed = missedDays(streak, now);
  const kept = streak.lastDay !== null && missed <= streak.freezes;
  const current = kept ? streak.current + 1 : 1;
  let freezes = kept ? streak.freezes - missed : streak.freezes;
  if (current % FREEZE_EVERY === 0) freezes = Math.min(MAX_FREEZES, freezes + 1);

  return { current, longest: Math.max(streak.longest, current), lastDay: today, freezes };
}
