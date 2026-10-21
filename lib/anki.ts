import { GenerationError } from "./generation/run";
import type { GenerateError } from "./generation/types";
import type { Card as SrsState } from "ts-fsrs";
import { srsFromJson, type SrsJson } from "./rows";
import type { CardType, Deck, StudyCard } from "./types";

/** Mirrors backend/stackd_api/anki.py, which enforces it. Anki packages with media get big. */
export const MAX_APKG_BYTES = 100 * 1024 * 1024;

export interface ImportedCard {
  front: string;
  back: string;
  type: CardType;
  topic: string;
  /** Set for cards Anki had already scheduled; undefined starts the card as new. */
  srs: SrsState | undefined;
}

async function fail(res: Response): Promise<never> {
  const body = (await res.json().catch(() => null)) as GenerateError | null;
  throw new GenerationError(body?.error ?? `Request failed (${res.status})`, body?.code ?? "upstream");
}

/** Parses an .apkg into decks. Cards Anki already scheduled keep their progress. */
export async function importAnki(file: File): Promise<{ name: string; cards: ImportedCard[] }[]> {
  const res = await fetch("/api/anki/import", { method: "POST", body: file });
  if (!res.ok) await fail(res);
  const { decks } = (await res.json()) as { decks: { name: string; cards: (Omit<ImportedCard, "srs"> & { srs: SrsJson | null })[] }[] };
  return decks.map((d) => ({ name: d.name, cards: d.cards.map((c) => ({ ...c, srs: c.srs ? srsFromJson(c.srs) : undefined })) }));
}

/** Downloads the deck as an .apkg Anki can open. */
export async function exportAnki(deck: Deck, cards: StudyCard[]): Promise<void> {
  const res = await fetch("/api/anki/export", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ deckName: deck.name, cards: cards.map((c) => ({ id: c.id, front: c.front, back: c.back, topic: c.topic })) }),
  });
  if (!res.ok) await fail(res);
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement("a"), { href: url, download: `${deck.name.replace(/[\\/:*?"<>|]+/g, "-")}.apkg` });
  a.click();
  URL.revokeObjectURL(url);
}
