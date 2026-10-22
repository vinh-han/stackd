import type { Card as SrsState } from "ts-fsrs";
import type { CardType, Deck, ReviewLog, Source, StudyCard } from "./types";

/*
 * App objects <-> database rows (supabase/migrations). Columns are snake_case; optional fields become null,
 * because an update that omits a key leaves the old value in place.
 */

export interface DeckRow {
  id: string;
  name: string;
  accent_hue: number;
  lang: string | null;
  exam_date: string | null;
  created_at: string;
}

export interface SourceRow {
  id: string;
  deck_id: string;
  title: string;
  kind: Source["kind"];
  chunks: string[];
  created_at: string;
}

export interface CardRow {
  id: string;
  deck_id: string;
  type: CardType;
  topic: string;
  subtopic: string | null;
  front: string;
  back: string;
  source_ref: string;
  source_id: string | null;
  chunk_index: number | null;
  source_quote: string | null;
  srs: SrsJson;
  due: string;
  suspended: boolean;
  created_at: string;
}

export interface ReviewLogRow {
  card_id: string;
  deck_id: string;
  grade: ReviewLog["grade"];
  at: string;
}

/** ts-fsrs card state as stored in jsonb: Dates as ISO strings. */
export type SrsJson = Omit<SrsState, "due" | "last_review"> & { due: string; last_review?: string | null };

const date = (s: string | null | undefined) => (s ? new Date(s) : undefined);

export const deckToRow = (d: Deck): DeckRow => ({
  id: d.id,
  name: d.name,
  accent_hue: d.accentHue,
  lang: d.lang ?? null,
  exam_date: d.examDate?.toISOString() ?? null,
  created_at: d.createdAt.toISOString(),
});

export const deckFromRow = (r: DeckRow): Deck => ({
  id: r.id,
  name: r.name,
  accentHue: r.accent_hue,
  lang: r.lang ?? undefined,
  examDate: date(r.exam_date),
  createdAt: new Date(r.created_at),
});

/** Only the columns present in `patch`, so an update touches nothing else. */
export function deckPatchToRow(patch: Partial<Pick<Deck, "name" | "lang" | "examDate">>): Partial<DeckRow> {
  const row: Partial<DeckRow> = {};
  if ("name" in patch) row.name = patch.name;
  if ("lang" in patch) row.lang = patch.lang ?? null;
  if ("examDate" in patch) row.exam_date = patch.examDate?.toISOString() ?? null;
  return row;
}

export const sourceToRow = (s: Source): SourceRow => ({
  id: s.id,
  deck_id: s.deckId,
  title: s.title,
  kind: s.kind,
  chunks: s.chunks,
  created_at: s.createdAt.toISOString(),
});

export const sourceFromRow = (r: SourceRow): Source => ({
  id: r.id,
  deckId: r.deck_id,
  title: r.title,
  kind: r.kind,
  chunks: r.chunks,
  createdAt: new Date(r.created_at),
});

export const srsToJson = (srs: SrsState): SrsJson => ({
  ...srs,
  due: srs.due.toISOString(),
  last_review: srs.last_review?.toISOString() ?? null,
});

export const srsFromJson = (j: SrsJson): SrsState => ({
  ...j,
  due: new Date(j.due),
  last_review: date(j.last_review),
});

export const cardToRow = (c: StudyCard): CardRow => ({
  id: c.id,
  deck_id: c.deckId,
  type: c.type,
  topic: c.topic,
  subtopic: c.subtopic ?? null,
  front: c.front,
  back: c.back,
  source_ref: c.sourceRef,
  source_id: c.sourceId ?? null,
  chunk_index: c.chunkIndex ?? null,
  source_quote: c.sourceQuote ?? null,
  srs: srsToJson(c.srs),
  due: c.srs.due.toISOString(),
  suspended: c.suspended ?? false,
  created_at: c.createdAt.toISOString(),
});

export const cardFromRow = (r: CardRow): StudyCard => ({
  id: r.id,
  deckId: r.deck_id,
  type: r.type,
  topic: r.topic,
  subtopic: r.subtopic ?? undefined,
  front: r.front,
  back: r.back,
  sourceRef: r.source_ref,
  sourceId: r.source_id ?? undefined,
  chunkIndex: r.chunk_index ?? undefined,
  sourceQuote: r.source_quote ?? undefined,
  srs: srsFromJson(r.srs),
  suspended: r.suspended || undefined,
  createdAt: new Date(r.created_at),
});

export const logToRow = (l: ReviewLog): ReviewLogRow => ({ card_id: l.cardId, deck_id: l.deckId, grade: l.grade, at: l.at.toISOString() });

export const logFromRow = (r: ReviewLogRow): ReviewLog => ({ cardId: r.card_id, deckId: r.deck_id, grade: r.grade, at: new Date(r.at) });
