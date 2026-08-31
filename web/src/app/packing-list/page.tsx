import { Suspense } from "react";
import PackingListClient from "@/components/PackingListClient";
import { getCategoryDivisionLists } from "@/lib/categories";
import { getPackingListPage } from "@/lib/services/packingList";
import { todayIso } from "@/lib/constants";
import { addDaysIso } from "@/lib/dateInput";
import type { CategoryDivisionLists } from "@/lib/packingDivision";

export const revalidate = 30;

function PackingListFallback({
  today,
  categoryLists,
}: {
  today: string;
  categoryLists: CategoryDivisionLists;
}) {
  return (
    <PackingListClient
      today={today}
      categoryLists={categoryLists}
      initialRows={[]}
      initialNextCursor={null}
      initialHasMore={false}
      initialLoaded={false}
    />
  );
}

async function PackingListLoader({
  today,
  tomorrow,
  categoryLists,
}: {
  today: string;
  tomorrow: string;
  categoryLists: CategoryDivisionLists;
}) {
  const initialPage = await getPackingListPage({
    deliveryFrom: today,
    deliveryTo: tomorrow,
    limit: 20,
  });

  return (
    <PackingListClient
      today={today}
      categoryLists={categoryLists}
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
  const categoryLists = await getCategoryDivisionLists();

  return (
    <Suspense fallback={<PackingListFallback today={today} categoryLists={categoryLists} />}>
      <PackingListLoader today={today} tomorrow={tomorrow} categoryLists={categoryLists} />
    </Suspense>
  );
}
