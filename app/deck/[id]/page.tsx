import type { Metadata } from "next";
import { ClientOnly } from "@/components/ClientOnly";
import { DeckDetail } from "@/components/deck/DeckDetail";

export const metadata: Metadata = { title: "Deck · Stackd" };

export default async function DeckPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <ClientOnly>
      <DeckDetail id={id} />
    </ClientOnly>
  );
}
