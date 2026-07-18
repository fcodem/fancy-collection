import { notFound, redirect } from "next/navigation";
import DashboardStatListClient from "@/components/DashboardStatListClient";
import { getCurrentUserForLayout } from "@/lib/auth";
import {
  BASE_ACCESSORY,
  BASE_JEWELLERY,
  BASE_MENS,
  BASE_WOMENS,
  todayIso,
} from "@/lib/constants";
import {
  categoriesInList,
  DASHBOARD_STAT_LISTS,
  getDashboardStatListPage,
  parseDashboardStatListType,
} from "@/lib/services/dashboardStatLists";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export default async function DashboardStatListPage({
  params,
}: {
  params: Promise<{ listType: string }>;
}) {
  const user = await getCurrentUserForLayout();
  if (!user) redirect("/login");

  const { listType: raw } = await params;
  const listType = parseDashboardStatListType(raw);
  if (!listType) notFound();

  const meta = DASHBOARD_STAT_LISTS[listType];
  const firstPage = await getDashboardStatListPage(listType, { page: 1 });
  const listCategories = categoriesInList(firstPage.bookings);
  const allCategories = [
    ...BASE_MENS,
    ...BASE_WOMENS,
    ...BASE_JEWELLERY,
    ...BASE_ACCESSORY,
  ];
  const categories = [
    ...new Set([...listCategories, ...allCategories].filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b));

  return (
    <DashboardStatListClient
      listType={listType}
      title={meta.title}
      description={meta.description}
      initialBookings={firstPage.bookings}
      initialTotal={firstPage.total}
      initialPage={firstPage.page}
      pageSize={firstPage.pageSize}
      hasMore={firstPage.hasMore}
      categories={categories}
      todayIso={todayIso()}
    />
  );
}
