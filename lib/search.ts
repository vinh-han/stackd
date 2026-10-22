import type { Deck, Source, StudyCard } from "./types";

/**
 * Lowercase, without tone marks or other accents, so "duy tri" finds "duy trì".
 * NFD splits a letter from its marks; đ has no decomposition, so it is mapped by hand.
 */
export function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export interface TopicHit {
  deck: Deck;
  name: string;
  count: number;
}

export interface SourceHit {
  deck: Deck;
  source: Source;
  count: number;
}

export interface DeckHit {
  deck: Deck;
  count: number;
}

export interface SearchResults {
  /** Every matching card: front matches before back-only matches. */
  cards: StudyCard[];
  decks: DeckHit[];
  topics: TopicHit[];
  sources: SourceHit[];
}

export const EMPTY_RESULTS: SearchResults = { cards: [], decks: [], topics: [], sources: [] };

export function search(data: { decks: Deck[]; cards: StudyCard[]; sources: Source[] }, query: string): SearchResults {
  const q = fold(query);
  if (!q) return EMPTY_RESULTS;
  const decksById = new Map(data.decks.map((d) => [d.id, d]));

  const front: StudyCard[] = [];
  const back: StudyCard[] = [];
  const perDeck = new Map<string, number>();
  const perTopic = new Map<string, number>();
  const perSource = new Map<string, number>();
  for (const c of data.cards) {
    if (!decksById.has(c.deckId)) continue;
    perDeck.set(c.deckId, (perDeck.get(c.deckId) ?? 0) + 1);
    const topicKey = `${c.deckId}\n${c.topic}`;
    perTopic.set(topicKey, (perTopic.get(topicKey) ?? 0) + 1);
    if (c.sourceId) perSource.set(c.sourceId, (perSource.get(c.sourceId) ?? 0) + 1);
    if (fold(c.front).includes(q)) front.push(c);
    else if (fold(c.back).includes(q)) back.push(c);
  }

  const topics: TopicHit[] = [];
  for (const [key, count] of perTopic) {
    const [deckId, name] = key.split("\n");
    if (fold(name).includes(q)) topics.push({ deck: decksById.get(deckId)!, name, count });
  }

  return {
    cards: [...front, ...back],
    decks: data.decks.filter((d) => fold(d.name).includes(q)).map((deck) => ({ deck, count: perDeck.get(deck.id) ?? 0 })),
    topics,
    sources: data.sources
      .filter((s) => decksById.has(s.deckId) && fold(s.title).includes(q))
      .map((source) => ({ deck: decksById.get(source.deckId)!, source, count: perSource.get(source.id) ?? 0 })),
  };
}
