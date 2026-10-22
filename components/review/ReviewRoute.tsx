"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { plural } from "@/lib/format";
import { useStore } from "@/lib/store";
import { ReviewScreen, type ReviewScope } from "./ReviewScreen";

/**
 * Names what is being reviewed for the header: "All decks", a deck, a topic, or "3 selected cards".
 * The title is fixed on mount, so it does not change as cards are rated or edited.
 */
export function ReviewRoute({ scope, from }: { scope: ReviewScope; from: string }) {
  const { decks, cards } = useStore();
  const router = useRouter();
  const deck = scope.deckId ? decks.find((d) => d.id === scope.deckId) : undefined;
  const missing = decks.length === 0 || (!!scope.deckId && !deck);

  const [title] = useState(() => {
    if (scope.cardIds) {
      const known = new Set(cards.map((c) => c.id));
      return plural(scope.cardIds.filter((id) => known.has(id)).length, "selected card");
    }
    return scope.topic ?? deck?.name ?? "All decks";
  });

  useEffect(() => {
    if (missing) router.replace(from);
  }, [missing, from, router]);

  return missing ? null : <ReviewScreen scope={scope} title={title} from={from} />;
}
