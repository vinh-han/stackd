import type { Metadata } from "next";
import { AddCards } from "@/components/add/AddCards";
import { ClientOnly } from "@/components/ClientOnly";

export const metadata: Metadata = { title: "Add cards | Stackd" };

export default async function AddPage({ searchParams }: { searchParams: Promise<{ deck?: string }> }) {
  const { deck } = await searchParams;
  return (
    <ClientOnly>
      <AddCards initialDeckId={deck} />
    </ClientOnly>
  );
}
