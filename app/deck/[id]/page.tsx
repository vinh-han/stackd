import { redirect } from "next/navigation";

/** The deck's home is its Overview tab; every tab has its own URL. */
export default async function DeckPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/deck/${id}/overview`);
}
