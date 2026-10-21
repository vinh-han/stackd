import type { Metadata } from "next";
import { AccountPage } from "@/components/account/AccountPage";
import { ClientOnly } from "@/components/ClientOnly";

export const metadata: Metadata = { title: "Account · Stackd" };

export default function Account() {
  return (
    <ClientOnly>
      <AccountPage />
    </ClientOnly>
  );
}
