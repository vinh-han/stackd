import { proxy } from "@/lib/backend";
import { MAX_FILE_BYTES } from "@/lib/generation/types";

export const runtime = "nodejs";

/** Builds an .apkg from a deck's cards. Handled by the Python backend. */
export function POST(req: Request) {
  return proxy("/anki/export", req, MAX_FILE_BYTES);
}
