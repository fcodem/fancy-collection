import { FinanceTopPerformer } from "@/components/finance/FinancePages";
import { monthStartIso, todayIso } from "@/lib/constants";

export default function TopPerformerPage() {
  const today = todayIso();
  return <FinanceTopPerformer monthStartIso={monthStartIso(today)} todayIso={today} />;
}
