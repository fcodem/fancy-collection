import FreeItemsClient from "@/components/FreeItemsClient";
import { todayIso } from "@/lib/constants";
import { addDaysIso } from "@/lib/dateInput";
import { isoDateParam } from "@/lib/urlDateParams";

export default async function FreeItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const today = todayIso();
  const from = isoDateParam(sp.from, today);
  const toRaw = isoDateParam(sp.to, addDaysIso(from, 1));
  const to = toRaw < from ? from : toRaw;
  return <FreeItemsClient today={today} initialFrom={from} initialTo={to} />;
}