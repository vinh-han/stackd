import { describe, expect, it } from "vitest";
import { EMPTY_STREAK, liveStreak, recordStudy } from "./streak";

const day = (d: number, hour = 20) => new Date(2026, 9, d, hour);

/** Studies on each given day of October, in order. */
const studyOn = (...days: number[]) => days.reduce((s, d) => recordStudy(s, day(d)), EMPTY_STREAK);

describe("recordStudy", () => {
  it("starts at 1 and counts consecutive days", () => {
    expect(studyOn(1).current).toBe(1);
    expect(studyOn(1, 2, 3).current).toBe(3);
  });

  it("counts a day once, however many reviews", () => {
    const s = recordStudy(recordStudy(EMPTY_STREAK, day(1, 8)), day(1, 23));
    expect(s.current).toBe(1);
  });

  it("resets after a missed day with no freeze", () => {
    const s = studyOn(1, 2, 4);
    expect(s.current).toBe(1);
    expect(s.longest).toBe(2);
  });

  it("earns a freeze on day 7 and spends it on a missed day", () => {
    const week = studyOn(1, 2, 3, 4, 5, 6, 7);
    expect(week.freezes).toBe(1);
    const after = recordStudy(week, day(9)); // missed the 8th
    expect(after.current).toBe(8);
    expect(after.freezes).toBe(0);
  });

  it("caps freezes at 2", () => {
    const s = studyOn(...Array.from({ length: 28 }, (_, i) => i + 1));
    expect(s.freezes).toBe(2);
  });
});

describe("liveStreak", () => {
  it("is at risk, not lost, when today has no review yet", () => {
    expect(liveStreak(studyOn(1, 2), day(3))).toEqual({ days: 2, freezes: 0, atRisk: true });
  });

  it("shows 0 once missed days exceed freezes", () => {
    expect(liveStreak(studyOn(1, 2), day(5)).days).toBe(0);
  });

  it("stays alive while a freeze covers the gap", () => {
    const week = studyOn(1, 2, 3, 4, 5, 6, 7);
    expect(liveStreak(week, day(9))).toEqual({ days: 7, freezes: 0, atRisk: true });
  });
});
