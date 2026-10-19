import { proxy } from "@/lib/backend";

export const runtime = "nodejs";

/** Status of an extraction job, with its chunks once done. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxy(`/jobs/${encodeURIComponent(id)}`, req);
}
