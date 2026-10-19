import type { Card as SrsState, Grade } from "ts-fsrs";

export const CARD_TYPES = ["qa", "cloze", "definition", "scenario", "vocab"] as const;
export type CardType = (typeof CARD_TYPES)[number];

export interface StudyCard {
  id: string;
  deckId: string;
  type: CardType;
  topic: string;
  subtopic?: string;
  front: string;
  back: string;
  /** Every card links back to the chunk it was generated from, so users can verify it. */
  sourceRef: string;
  sourceId?: string;
  chunkIndex?: number;
  /** Short verbatim excerpt of the chunk that supports the card. */
  sourceQuote?: string;
  srs: SrsState;
  createdAt: Date;
}

export interface Deck {
  id: string;
  name: string;
  /** OKLCH hue for the Good / Easy buttons. The only color on the review screen. */
  accentHue: number;
  /** BCP 47 tag for card content, when it differs from the UI language. */
  lang?: string;
  examDate?: Date;
  createdAt: Date;
}

export interface Source {
  id: string;
  deckId: string;
  title: string;
  kind: "text" | "file";
  chunks: string[];
  createdAt: Date;
}

/** Every rating is kept: FSRS optimization, history and leech detection all need it later. */
export interface ReviewLog {
  cardId: string;
  deckId: string;
  grade: Grade;
  at: Date;
}

export interface Streak {
  current: number;
  longest: number;
  /** Local calendar day (YYYY-MM-DD) of the last review. */
  lastDay: string | null;
  freezes: number;
}
