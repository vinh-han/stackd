import { createEmptyCard } from "ts-fsrs";
import { describe, expect, it } from "vitest";
import { fold, search } from "./search";
import type { Deck, Source, StudyCard } from "./types";

const deck = (id: string, name: string): Deck => ({ id, name, accentHue: 190, createdAt: new Date(0) });
const card = (id: string, deckId: string, front: string, back: string, topic = "General", sourceId?: string): StudyCard => ({
  id,
  deckId,
  type: "qa",
  topic,
  front,
  back,
  sourceRef: "",
  sourceId,
  srs: createEmptyCard(new Date(0)),
  createdAt: new Date(0),
});

describe("fold", () => {
  it("drops Vietnamese tone marks and maps d with stroke", () => {
    expect(fold("Duy Trì")).toBe("duy tri");
    expect(fold("Đường đi")).toBe("duong di");
    expect(fold("Tiếng   Việt")).toBe("tieng viet");
  });
});

describe("search", () => {
  const decks = [deck("vi", "Tiếng Việt B1"), deck("aws", "AWS SAA-C03")];
  const sources: Source[] = [{ id: "s1", deckId: "vi", title: "bài-đọc-3.txt", kind: "text", chunks: [], createdAt: new Date(0) }];
  const cards = [
    card("1", "vi", "to maintain", "duy trì"),
    card("2", "vi", "duy trì thói quen", "to keep a habit", "Thói quen", "s1"),
    card("3", "aws", "Glacier retrieval", "Minutes to hours", "Storage"),
    card("4", "gone", "duy tri", "deck was deleted"),
  ];
  const data = { decks, cards, sources };

  it("matches either side regardless of tone marks, front matches first", () => {
    expect(search(data, "duy tri").cards.map((c) => c.id)).toEqual(["2", "1"]);
    expect(search(data, "DUY TRÌ").cards.map((c) => c.id)).toEqual(["2", "1"]);
  });

  it("finds decks, topics and sources by name, with card counts", () => {
    const r = search(data, "tieng viet");
    expect(r.decks.map((d) => [d.deck.id, d.count])).toEqual([["vi", 2]]);
    expect(search(data, "thoi quen").topics).toMatchObject([{ name: "Thói quen", count: 1 }]);
    expect(search(data, "bai-doc").sources).toMatchObject([{ source: { id: "s1" }, count: 1 }]);
    expect(search(data, "storage").topics[0].deck.id).toBe("aws");
  });

  it("returns nothing for a blank query", () => {
    expect(search(data, "   ").cards).toEqual([]);
  });
});
