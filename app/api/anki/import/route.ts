import { proxy } from "@/lib/backend";
import { MAX_APKG_BYTES } from "@/lib/anki";

export const runtime = "nodejs";

/** Parses an uploaded Anki package. Handled by the Python backend. */
export function POST(req: Request) {
  return proxy("/anki/import", req, MAX_APKG_BYTES);
}
