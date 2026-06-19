import ServerAppShell from "@/components/ServerAppShell";
import PackingListClient from "@/components/PackingListClient";
import { todayIso } from "@/lib/constants";

export default async function PackingListPage() {
return (
    <ServerAppShell>
      <PackingListClient today={todayIso()} />
    </ServerAppShell>
  );
}
