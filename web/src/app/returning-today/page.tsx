import ReturningTodayClient from "@/components/ReturningTodayClient";
import {
  BASE_ACCESSORY,
  BASE_JEWELLERY,
  BASE_MENS,
  BASE_WOMENS,
  todayIso,
} from "@/lib/constants";
import { getAllCategories } from "@/lib/categories";

export const dynamic = "force-dynamic";

export default async function ReturningTodayPage() {
  const categories = await getAllCategories()
    .then((c) => c.all_categories.filter((n) => n !== "Other"))
    .catch(() => [...BASE_MENS, ...BASE_WOMENS, ...BASE_JEWELLERY, ...BASE_ACCESSORY]);
  return (
    <ReturningTodayClient today={todayIso()} categories={categories} />
  );
}
