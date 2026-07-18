import PackingListClient from "@/components/PackingListClient";
import { getPackingListCached } from "@/lib/services/operations";
import { todayIso } from "@/lib/constants";

export const revalidate = 30;

export default async function PackingListPage() {
  const today = todayIso();
  const initialRows = await getPackingListCached(today, today);

  return (
    <PackingListClient
      today={today}
      initialRows={initialRows}
      initialLoaded
    />
  );
}
