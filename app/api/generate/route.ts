import { proxy } from "@/lib/backend";

export const runtime = "nodejs";

/** Generates cards for one chunk. Handled by the Python backend. */
export function POST(req: Request) {
  return proxy("/generate", req);
}
