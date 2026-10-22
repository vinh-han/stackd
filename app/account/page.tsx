import type { Metadata } from "next";
import { AccountPage, type AccountMode } from "@/components/account/AccountPage";
import { ClientOnly } from "@/components/ClientOnly";

export const metadata: Metadata = { title: "Account | Stackd" };

const MODES: Record<string, AccountMode> = { signin: "signIn", reset: "reset" };

export default async function Account({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const { mode } = await searchParams;
  return (
    <ClientOnly>
      {/* Keyed so the rail's Sign in link switches mode even when already on this page. */}
      <AccountPage key={mode ?? ""} mode={MODES[mode ?? ""] ?? "signUp"} />
    </ClientOnly>
  );
}
