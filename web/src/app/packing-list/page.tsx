import PackingListClient from "@/components/PackingListClient";
import { getPackingListPage } from "@/lib/services/packingList";
import { todayIso } from "@/lib/constants";

export const revalidate = 30;

export default async function PackingListPage() {
  const today = todayIso();
  const initialPage = await getPackingListPage({
    deliveryFrom: today,
    deliveryTo: today,
    limit: 20,
  });

  return (
    <PackingListClient
      today={today}
      initialRows={initialPage.results}
      initialNextCursor={initialPage.nextCursor}
      initialHasMore={initialPage.hasMore}
      initialLoaded
    />
  );
}
