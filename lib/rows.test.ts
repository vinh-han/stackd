import { createEmptyCard, Rating } from "ts-fsrs";
import { expect, it } from "vitest";
import { cardFromRow, cardToRow, deckFromRow, deckPatchToRow, deckToRow } from "./rows";
import { rate } from "./scheduler";
import type { StudyCard } from "./types";

const t = new Date("2026-10-20T08:00:00.000Z");

it("round-trips a reviewed card, Dates included, through a JSON database row", () => {
  const srs = rate(createEmptyCard(t), Rating.Good, t);
  const card: StudyCard = {
    id: "c1", deckId: "d1", type: "cloze", topic: "Storage", front: "___ is cheap", back: "Glacier",
    sourceRef: "notes.pdf p.3", sourceId: "s1", chunkIndex: 2, sourceQuote: "Glacier is cheap", srs, createdAt: t,
  };
  const row = JSON.parse(JSON.stringify(cardToRow(card))); // what the database hands back

  expect(row.due).toBe(srs.due.toISOString()); // indexed column matches the state
  const back = cardFromRow(row);
  expect(back).toEqual(card);
  expect(back.srs.due).toBeInstanceOf(Date);
  expect(back.srs.last_review).toBeInstanceOf(Date);
});

it("stores missing optional fields as null and reads them back as undefined", () => {
  const card: StudyCard = {
    id: "c2", deckId: "d1", type: "qa", topic: "T", front: "Q", back: "A", sourceRef: "written by you",
    srs: createEmptyCard(t), createdAt: t,
  };
  const row = cardToRow(card);
  expect([row.subtopic, row.source_id, row.chunk_index, row.source_quote, row.srs.last_review]).toEqual([null, null, null, null, null]);
  expect(cardFromRow(JSON.parse(JSON.stringify(row)))).toEqual(card);
});

it("round-trips a deck with and without an exam date", () => {
  const deck = { id: "d1", name: "AWS", accentHue: 190, lang: "vi", examDate: new Date("2026-11-10T09:00:00.000Z"), createdAt: t };
  expect(deckFromRow(JSON.parse(JSON.stringify(deckToRow(deck))))).toEqual(deck);
  const bare = { id: "d2", name: "B", accentHue: 300, createdAt: t };
  expect(deckFromRow(JSON.parse(JSON.stringify(deckToRow(bare))))).toEqual({ ...bare, lang: undefined, examDate: undefined });
});

it("deck patches touch only the given columns, and clearing a field sends null", () => {
  expect(deckPatchToRow({ name: "New" })).toEqual({ name: "New" });
  expect(deckPatchToRow({ examDate: undefined })).toEqual({ exam_date: null }); // cleared date really clears
  expect(deckPatchToRow({ lang: "vi", examDate: t })).toEqual({ lang: "vi", exam_date: t.toISOString() });
});
