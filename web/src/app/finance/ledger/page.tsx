import FinanceLedger from "@/components/finance/FinanceLedger";
import { todayIso } from "@/lib/constants";

export default function LedgerPage() {
  const today = todayIso();
  return <FinanceLedger todayIso={today} monthIso={today.slice(0, 7)} />;
}
