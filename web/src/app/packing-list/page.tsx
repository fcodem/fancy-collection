import { Suspense } from "react";
import PackingListClient from "@/components/PackingListClient";
import { getPackingListPage } from "@/lib/services/packingList";
import { todayIso } from "@/lib/constants";
import { addDaysIso } from "@/lib/dateInput";

export const revalidate = 30;

function PackingListFallback({ today }: { today: string }) {
  return (
    <PackingListClient
      today={today}
      initialRows={[]}
      initialNextCursor={null}
      initialHasMore={false}
      initialLoaded={false}
    />
  );
}

async function PackingListLoader({ today, tomorrow }: { today: string; tomorrow: string }) {
  const initialPage = await getPackingListPage({
    deliveryFrom: today,
    deliveryTo: tomorrow,
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

export default async function PackingListPage() {
  const today = todayIso();
  const tomorrow = addDaysIso(today, 1);

  return (
    <Suspense fallback={<PackingListFallback today={today} />}>
      <PackingListLoader today={today} tomorrow={tomorrow} />
    </Suspense>
  );
}
