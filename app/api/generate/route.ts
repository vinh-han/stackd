import { proxyJson } from "@/lib/backend";

export const runtime = "nodejs";

/** Generates cards for one chunk. Handled by the Python backend. */
export function POST(req: Request) {
  return proxyJson("/generate", req);
}
