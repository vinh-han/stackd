import type { CardType } from "../types";

/*
 * Wire types for the Python backend (backend/stackd_api/schemas.py). Keep the two in sync.
 */

/** Mirrors MAX_INPUT_CHARS in backend/stackd_api/chunking.py, which enforces it. Here only for the counter. */
export const MAX_INPUT_CHARS = 50_000;

export interface GeneratedCard {
  front: string;
  back: string;
  topic: string;
  subtopic?: string | null;
  type: CardType;
  sourceQuote: string;
}

export interface GenerateResponse {
  /** BCP 47 primary tag of the source, e.g. "vi", "en". */
  language?: string | null;
  cards: GeneratedCard[];
}

export interface ChunkResponse {
  chunks: string[];
}

export interface GenerateError {
  error: string;
  /** "unavailable" comes from the Next.js proxy when the backend is down; the rest from the backend. */
  code: "missing_key" | "bad_config" | "bad_request" | "upstream" | "unavailable";
}
