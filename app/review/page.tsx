import type { Metadata } from "next";
import { ClientOnly } from "@/components/ClientOnly";
import { ReviewRoute } from "@/components/review/ReviewRoute";

export const metadata: Metadata = { title: "Review | Stackd" };

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ deck?: string; topic?: string; cards?: string }>;
}) {
  const { deck, topic, cards } = await searchParams;
  const scope = { topic: topic || undefined, cardIds: cards ? cards.split(",").filter(Boolean) : undefined };
  return (
    <ClientOnly>
      {/* Keyed so switching decks from the rail, or picking a topic, starts a fresh session. */}
      <ReviewRoute key={`${deck ?? ""}|${topic ?? ""}|${cards ?? ""}`} deckId={deck} scope={scope} />
    </ClientOnly>
  );
}
