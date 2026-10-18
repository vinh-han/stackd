import type { ChunkResponse, GenerateError, GenerateResponse, GeneratedCard } from "./types";

const CONCURRENCY = 2;
const RETRY_DELAY_MS = 1000;

export class GenerationError extends Error {
  constructor(message: string, readonly code: GenerateError["code"]) {
    super(message);
  }
}

interface ChunkResult {
  index: number;
  cards: GeneratedCard[];
  language?: string;
}

export interface RunResult {
  chunks: ChunkResult[];
  failed: number;
  /** Most common detected language across chunks. */
  language?: string;
}

async function errorFrom(res: Response): Promise<GenerationError> {
  const body = (await res.json().catch(() => null)) as GenerateError | null;
  return new GenerationError(body?.error ?? `Request failed (${res.status})`, body?.code ?? "upstream");
}

/** Splits pasted text into generation-sized chunks (done by the backend). */
export async function splitText(text: string, signal: AbortSignal): Promise<string[]> {
  const res = await fetch("/api/chunk", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
    signal,
  });
  if (!res.ok) throw await errorFrom(res);
  return ((await res.json()) as ChunkResponse).chunks;
}

async function requestChunk(text: string, topics: string[], signal: AbortSignal): Promise<GenerateResponse> {
  let lastError: GenerationError | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, topics }),
      signal,
    });
    if (res.ok) return res.json();
    lastError = await errorFrom(res);
    // Configuration and input errors will not fix themselves on retry.
    if (lastError.code !== "upstream") break;
  }
  throw lastError;
}

/** Runs every chunk through /api/generate. Later chunks see topics found by earlier ones. */
export async function generateFromChunks(
  chunks: string[],
  deckTopics: string[],
  onProgress: (done: number, cardsSoFar: number) => void,
  signal: AbortSignal,
): Promise<RunResult> {
  const topics = new Set(deckTopics);
  const results: ChunkResult[] = [];
  let next = 0;
  let failed = 0;
  let fatal: GenerationError | undefined;

  const worker = async () => {
    while (next < chunks.length && !fatal && !signal.aborted) {
      const index = next++;
      try {
        const res = await requestChunk(chunks[index], [...topics], signal);
        res.cards.forEach((c) => topics.add(c.topic));
        results.push({ index, cards: res.cards, language: res.language ?? undefined });
      } catch (err) {
        if (signal.aborted) return;
        if (err instanceof GenerationError && err.code !== "upstream") fatal = err;
        failed++;
      }
      onProgress(results.length + failed, results.reduce((n, r) => n + r.cards.length, 0));
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, worker));
  if (fatal) throw fatal;
  if (results.length === 0 && failed > 0) throw new GenerationError("Card generation failed. Try again.", "upstream");

  const langCounts = new Map<string, number>();
  for (const r of results) if (r.language) langCounts.set(r.language, (langCounts.get(r.language) ?? 0) + 1);
  const language = [...langCounts].sort((a, b) => b[1] - a[1])[0]?.[0];

  return { chunks: results.sort((a, b) => a.index - b.index), failed, language };
}
