"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { ReviewScreen } from "./ReviewScreen";

/**
 * Resolves ?deck= to a deck: the requested one, else the first with cards due, else the first.
 * The choice is pinned on mount, so rating the last due card does not hop to another deck.
 */
export function ReviewRoute({ deckId }: { deckId?: string }) {
  const { decks, cards } = useStore();
  const router = useRouter();
  const [pinnedId] = useState(() => {
    const now = new Date();
    return (
      decks.find((d) => d.id === deckId) ??
      decks.find((d) => cards.some((c) => c.deckId === d.id && c.srs.due <= now)) ??
      decks[0]
    )?.id;
  });
  const deck = decks.find((d) => d.id === pinnedId);

  useEffect(() => {
    if (!deck) router.replace("/");
  }, [deck, router]);

  return deck ? <ReviewScreen deck={deck} /> : null;
}
