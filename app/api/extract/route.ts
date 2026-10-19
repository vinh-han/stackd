import { proxy } from "@/lib/backend";
import { MAX_FILE_BYTES } from "@/lib/generation/types";

export const runtime = "nodejs";

/** Queues an uploaded file (raw body) for text extraction. Handled by the Python backend. */
export function POST(req: Request) {
  const filename = new URL(req.url).searchParams.get("filename") ?? "";
  return proxy(`/extract?filename=${encodeURIComponent(filename)}`, req, MAX_FILE_BYTES);
}
