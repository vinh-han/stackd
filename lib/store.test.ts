import { createEmptyCard } from "ts-fsrs";
import { expect, it } from "vitest";
import { parseLegacy } from "./store";

it("restores Dates when importing the old localStorage format", () => {
  const due = new Date("2026-10-20T08:00:00.000Z");
  const saved = {
    version: 1,
    decks: [{ id: "d", name: "Deck", accentHue: 190, examDate: new Date("2026-11-10T09:00:00Z"), createdAt: due }],
    cards: [{ id: "c", deckId: "d", front: "due", back: "createdAt", srs: { ...createEmptyCard(due), due }, createdAt: due }],
    sources: [],
    reviewLogs: [{ cardId: "c", deckId: "d", grade: 3, at: due }],
    streak: { current: 1, longest: 1, lastDay: "2026-10-18", freezes: 0 },
  };

  const back = parseLegacy(JSON.stringify(saved));

  expect(back.cards[0].srs.due).toEqual(due);
  expect(back.cards[0].srs.due).toBeInstanceOf(Date);
  expect(back.decks[0].examDate).toBeInstanceOf(Date);
  expect(back.reviewLogs[0].at).toBeInstanceOf(Date);
  // Only date fields are converted: card text that looks like a key name stays text.
  expect(back.cards[0].front).toBe("due");
  expect(back.streak.lastDay).toBe("2026-10-18");
});
