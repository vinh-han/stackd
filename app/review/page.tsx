import type { Metadata } from "next";
import { ClientOnly } from "@/components/ClientOnly";
import { ReviewRoute } from "@/components/review/ReviewRoute";

export const metadata: Metadata = { title: "Review · Stackd" };

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ deck?: string }> }) {
  const { deck } = await searchParams;
  return (
    <ClientOnly>
      {/* Keyed so switching decks from the rail starts a fresh session. */}
      <ReviewRoute key={deck ?? ""} deckId={deck} />
    </ClientOnly>
  );
}
