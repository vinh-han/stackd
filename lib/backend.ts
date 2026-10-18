import "server-only";
import { NextResponse } from "next/server";
import type { GenerateError } from "./generation/types";

/** The Python service that owns all server-side work (chunking, generation, ingestion). */
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";
const TIMEOUT_MS = 60_000;
/** 50,000 characters of text, JSON-escaped and UTF-8 encoded, fits well inside this. */
const MAX_BODY_BYTES = 256 * 1024;

/** Forwards a JSON POST to the backend and relays its status and body unchanged. */
export async function proxyJson(path: string, req: Request): Promise<Response> {
  // Check before buffering: one huge body would otherwise exhaust the container's memory.
  // Bodies without a length (chunked uploads) are capped by Caddy's request_body in production.
  if (Number(req.headers.get("content-length")) > MAX_BODY_BYTES) {
    const body: GenerateError = { error: "Request too large.", code: "bad_request" };
    return NextResponse.json(body, { status: 413 });
  }
  let res: Response;
  try {
    res = await fetch(`${BACKEND_URL}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: await req.text(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    console.error(`backend ${path}:`, err);
    const body: GenerateError = {
      error: "The Stackd backend is not running. Start it with: npm run dev:api",
      code: "unavailable",
    };
    return NextResponse.json(body, { status: 503 });
  }
  return new Response(res.body, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}
