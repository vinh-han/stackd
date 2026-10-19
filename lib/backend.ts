import "server-only";
import { NextResponse } from "next/server";
import type { GenerateError } from "./generation/types";

/** The Python service that owns all server-side work (chunking, generation, ingestion). */
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";
const TIMEOUT_MS = 60_000;
/** 50,000 characters of text, JSON-escaped and UTF-8 encoded, fits well inside this. */
export const MAX_JSON_BYTES = 256 * 1024;

const fail = (status: number, body: GenerateError) => NextResponse.json(body, { status });

/** Forwards a request to the backend (same method, body and content type) and relays the response unchanged. */
export async function proxy(path: string, req: Request, maxBytes = MAX_JSON_BYTES): Promise<Response> {
  // Check before buffering: one huge body would otherwise exhaust the container's memory.
  // Bodies without a length (chunked uploads) are capped by Caddy's request_body in production.
  if (Number(req.headers.get("content-length")) > maxBytes) {
    return fail(413, { error: "Request too large.", code: "bad_request" });
  }
  let res: Response;
  try {
    res = await fetch(`${BACKEND_URL}${path}`, {
      method: req.method,
      headers: { "content-type": req.headers.get("content-type") ?? "application/octet-stream" },
      body: req.method === "GET" ? undefined : await req.arrayBuffer(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    console.error(`backend ${path}:`, err);
    return fail(503, { error: "The Stackd backend is not running. Start it with: npm run dev:api", code: "unavailable" });
  }
  return new Response(res.body, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}
