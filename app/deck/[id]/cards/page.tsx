import type { Metadata } from "next";
import { ClientOnly } from "@/components/ClientOnly";
import { AllCards } from "@/components/deck/AllCards";

export const metadata: Metadata = { title: "All cards | Stackd" };

export default async function AllCardsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <ClientOnly>
      <AllCards id={id} />
    </ClientOnly>
  );
}
