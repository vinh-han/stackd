import { ClientOnly } from "@/components/ClientOnly";
import { Dashboard } from "@/components/dashboard/Dashboard";

export default function Home() {
  return (
    <ClientOnly>
      <Dashboard />
    </ClientOnly>
  );
}
