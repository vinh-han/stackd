import type { Metadata } from "next";
import { ClientOnly } from "@/components/ClientOnly";
import { DeckOverview } from "@/components/deck/DeckOverview";

export const metadata: Metadata = { title: "Deck | Stackd" };

export default async function OverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <ClientOnly>
      <DeckOverview id={id} />
    </ClientOnly>
  );
}
