import { proxy } from "@/lib/backend";

export const runtime = "nodejs";

/** Splits pasted text into generation-sized chunks. Handled by the Python backend. */
export function POST(req: Request) {
  return proxy("/chunk", req);
}
