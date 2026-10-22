import type { Metadata } from "next";
import { ClientOnly } from "@/components/ClientOnly";
import { DeckSettingsPage } from "@/components/deck/DeckSettings";

export const metadata: Metadata = { title: "Deck settings | Stackd" };

export default async function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <ClientOnly>
      <DeckSettingsPage id={id} />
    </ClientOnly>
  );
}
