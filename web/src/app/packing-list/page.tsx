import ServerAppShell from "@/components/ServerAppShell";
import PackingListClient from "@/components/PackingListClient";
import { getPackingList } from "@/lib/services/operations";
import { todayIso } from "@/lib/constants";

export default async function PackingListPage() {
  const today = todayIso();
  const initialRows = await getPackingList(today, today);

  return (
    <ServerAppShell>
      <PackingListClient today={today} initialRows={initialRows} />
    </ServerAppShell>
  );
}
