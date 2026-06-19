import ServerAppShell from "@/components/ServerAppShell";
import FreeItemsClient from "@/components/FreeItemsClient";
import { todayIso } from "@/lib/constants";

export default async function FreeItemsPage() {
return (
    <ServerAppShell>
      <FreeItemsClient today={todayIso()} />
    </ServerAppShell>
  );
}
