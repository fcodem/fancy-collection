import { notFound, redirect } from "next/navigation";
import ServerAppShell from "@/components/ServerAppShell";
import DashboardStatListClient from "@/components/DashboardStatListClient";
import { getCurrentUser } from "@/lib/auth";
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
  getDashboardStatList,
  parseDashboardStatListType,
} from "@/lib/services/dashboardStatLists";

export default async function DashboardStatListPage({
  params,
}: {
  params: Promise<{ listType: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { listType: raw } = await params;
  const listType = parseDashboardStatListType(raw);
  if (!listType) notFound();

  const meta = DASHBOARD_STAT_LISTS[listType];
  const bookings = await getDashboardStatList(listType);
  const listCategories = categoriesInList(bookings);
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
    <ServerAppShell>
      <DashboardStatListClient
        listType={listType}
        title={meta.title}
        description={meta.description}
        bookings={bookings}
        categories={categories}
        todayIso={todayIso()}
      />
    </ServerAppShell>
  );
}
