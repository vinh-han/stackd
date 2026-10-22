import type { Metadata } from "next";
import { ClientOnly } from "@/components/ClientOnly";
import { DeckSources } from "@/components/deck/DeckSources";

export const metadata: Metadata = { title: "Sources | Stackd" };

export default async function SourcesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ source?: string }>;
}) {
  const { id } = await params;
  const { source } = await searchParams;
  return (
    <ClientOnly>
      <DeckSources id={id} focusId={source} />
    </ClientOnly>
  );
}
