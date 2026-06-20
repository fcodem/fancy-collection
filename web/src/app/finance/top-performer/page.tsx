import { FinanceTopPerformer } from "@/components/finance/FinancePages";
import { getAllCategories } from "@/lib/categories";
import { monthStartIso, todayIso } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function TopPerformerPage() {
  const today = todayIso();
  const cats = await getAllCategories();
  const allCategories = [
    ...cats.mens_categories,
    ...cats.womens_categories,
    ...cats.jewellery_categories,
    ...cats.accessory_categories,
  ];
  return <FinanceTopPerformer monthStartIso={monthStartIso(today)} todayIso={today} categories={allCategories} />;
}
