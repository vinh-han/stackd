import { createEmptyCard, Rating } from "ts-fsrs";
import { expect, it } from "vitest";
import { cardTag, dueDay, forecast, matchesFilter, reviewMinutes, sortCards, statusCounts } from "./deck-stats";
import { LEECH_LAPSES, rate } from "./scheduler";
import type { StudyCard } from "./types";

const now = new Date(2026, 9, 21, 10, 0);
const at = (days: number, hour = 10) => new Date(2026, 9, 21 + days, hour, 0);

let n = 0;
function card(patch: Partial<StudyCard> & { dueIn?: number } = {}): StudyCard {
  const { dueIn, ...rest } = patch;
  const learned = rate(createEmptyCard(at(-30)), Rating.Easy, at(-30));
  const srs = dueIn === undefined ? createEmptyCard(at(-1)) : { ...learned, due: at(dueIn) };
  return { id: `c${n++}`, deckId: "d", type: "qa", topic: "T", front: "Q", back: "A", sourceRef: "", srs, createdAt: at(-1), ...rest };
}

it("buckets every unsuspended card once: new, due, learning or known", () => {
  const relearning = card({ dueIn: 1 });
  relearning.srs = { ...rate(relearning.srs, Rating.Again, at(-1)), due: at(1) };
  const cards = [card(), card({ dueIn: -2 }), card({ dueIn: 0 }), relearning, card({ dueIn: 5 }), card({ dueIn: -1, suspended: true })];
  expect(statusCounts(cards, now)).toEqual({ new: 1, due: 2, learning: 1, known: 1 });
});

it("forecasts by calendar day, with overdue cards counted today and suspended ones skipped", () => {
  const cards = [card({ dueIn: -3 }), card({ dueIn: 0 }), card({ dueIn: 1 }), card({ dueIn: 6 }), card({ dueIn: 7 }), card({ dueIn: 2, suspended: true })];
  const days = forecast(cards, now);
  expect(days).toHaveLength(7);
  expect(days.map((d) => d.count)).toEqual([2, 1, 0, 0, 0, 0, 1]);
  expect(days[1].day.getDate()).toBe(22);
});

it("filters leeches by lapses and keeps suspended cards out of due and new", () => {
  const leech = card({ dueIn: 3 });
  leech.srs = { ...leech.srs, lapses: LEECH_LAPSES };
  const suspendedDue = card({ dueIn: -1, suspended: true });
  const fresh = card();
  expect(matchesFilter(leech, "leech", now)).toBe(true);
  expect(matchesFilter(suspendedDue, "due", now)).toBe(false);
  expect(matchesFilter(suspendedDue, "suspended", now)).toBe(true);
  expect(matchesFilter(fresh, "new", now)).toBe(true);
  expect(matchesFilter(fresh, "due", now)).toBe(true); // new cards are due at once
  expect([cardTag(suspendedDue), cardTag(leech), cardTag(fresh), cardTag(card({ dueIn: 2 }))]).toEqual(["Suspended", "Leech", "New", null]);
});

it("sorts hardest first by FSRS difficulty, with unrated cards last", () => {
  const easy = card({ dueIn: 1 });
  const hard = card({ dueIn: 2 });
  hard.srs = { ...hard.srs, difficulty: 9 };
  easy.srs = { ...easy.srs, difficulty: 2 };
  const fresh = card();
  expect(sortCards([fresh, easy, hard], "hardest").map((c) => c.id)).toEqual([hard.id, easy.id, fresh.id]);
});

it("labels due days and estimates review time at 30 seconds a card", () => {
  expect([dueDay(at(-4), now), dueDay(at(0, 23), now), dueDay(at(1, 1), now), dueDay(at(21), now)]).toEqual(["Today", "Today", "Tomorrow", "in 21d"]);
  expect([reviewMinutes(1), reviewMinutes(12), reviewMinutes(47)]).toEqual([1, 6, 24]);
});
