import ServerAppShell from "@/components/ServerAppShell";
import ReturningTodayClient from "@/components/ReturningTodayClient";
import {
  BASE_ACCESSORY,
  BASE_JEWELLERY,
  BASE_MENS,
  BASE_WOMENS,
  todayIso,
} from "@/lib/constants";

export default async function ReturningTodayPage() {
  const categories = [...BASE_MENS, ...BASE_WOMENS, ...BASE_JEWELLERY, ...BASE_ACCESSORY];
  return (
    <ServerAppShell>
      <ReturningTodayClient today={todayIso()} categories={categories} />
    </ServerAppShell>
  );
}
