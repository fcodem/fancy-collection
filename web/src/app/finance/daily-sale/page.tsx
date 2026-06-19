import FinanceDailySalePage from "@/components/finance/FinanceDailySale";
import { todayIso } from "@/lib/constants";

export default function DailySalePage() {
  return <FinanceDailySalePage todayIso={todayIso()} />;
}
