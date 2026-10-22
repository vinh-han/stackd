import { ClientOnly } from "@/components/ClientOnly";
import { Today } from "@/components/today/Today";

export default function Home() {
  return (
    <ClientOnly>
      <Today />
    </ClientOnly>
  );
}
