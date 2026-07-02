import { FinanceInventoryProfitability } from "@/components/finance/FinancePages";
import { monthStartIso, todayIso } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default function InventoryProfitabilityPage() {
  const today = todayIso();
  return (
    <FinanceInventoryProfitability monthStartIso={monthStartIso(today)} todayIso={today} />
  );
}
