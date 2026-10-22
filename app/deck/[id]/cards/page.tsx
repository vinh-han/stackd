import type { Metadata } from "next";
import { ClientOnly } from "@/components/ClientOnly";
import { AllCards } from "@/components/deck/AllCards";
import { FILTERS, type CardFilter } from "@/lib/deck-stats";

export const metadata: Metadata = { title: "Cards | Stackd" };

export default async function CardsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ card?: string; q?: string; topic?: string; filter?: string }>;
}) {
  const { id } = await params;
  const { card, q, topic, filter } = await searchParams;
  const initialFilter = FILTERS.find((f) => f.key === filter)?.key as CardFilter | undefined;
  return (
    <ClientOnly>
      {/* Keyed so a search result opened while already on this page applies its card, query or topic. */}
      <AllCards
        key={`${card ?? ""}|${q ?? ""}|${topic ?? ""}|${filter ?? ""}`}
        id={id}
        focusCardId={card}
        initialQuery={q}
        focusTopic={topic}
        initialFilter={initialFilter}
      />
    </ClientOnly>
  );
}
