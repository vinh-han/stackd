"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { isDue } from "@/lib/scheduler";
import { useStore } from "@/lib/store";
import { ReviewScreen, type ReviewScope } from "./ReviewScreen";

/**
 * Resolves ?deck= to a deck: the requested one, else the first with cards due, else the first.
 * The choice is pinned on mount, so rating the last due card does not hop to another deck.
 * A scope (one topic, or picked cards) only applies to the deck it was made for.
 */
export function ReviewRoute({ deckId, scope }: { deckId?: string; scope?: ReviewScope }) {
  const { decks, cards } = useStore();
  const router = useRouter();
  const [pinnedId] = useState(() => {
    const now = new Date();
    return (
      decks.find((d) => d.id === deckId) ??
      decks.find((d) => cards.some((c) => c.deckId === d.id && isDue(c, now))) ??
      decks[0]
    )?.id;
  });
  const deck = decks.find((d) => d.id === pinnedId);

  useEffect(() => {
    if (!deck) router.replace("/");
  }, [deck, router]);

  return deck ? <ReviewScreen deck={deck} scope={deck.id === deckId ? scope : undefined} /> : null;
}
