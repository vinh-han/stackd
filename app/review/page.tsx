import type { Metadata } from "next";
import { ClientOnly } from "@/components/ClientOnly";
import { ReviewRoute } from "@/components/review/ReviewRoute";
import { safeFrom } from "@/lib/links";

export const metadata: Metadata = { title: "Review | Stackd" };

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ deck?: string; topic?: string; ids?: string; from?: string }>;
}) {
  const { deck, topic, ids, from } = await searchParams;
  const scope = {
    deckId: deck || undefined,
    topic: topic || undefined,
    cardIds: ids ? ids.split(",").filter(Boolean) : undefined,
  };
  return (
    <ClientOnly>
      {/* Keyed so starting another review from the same page starts a fresh session. */}
      <ReviewRoute key={`${deck ?? ""}|${topic ?? ""}|${ids ?? ""}`} scope={scope} from={safeFrom(from)} />
    </ClientOnly>
  );
}
