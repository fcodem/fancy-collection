import { FinanceMonthlySale } from "@/components/finance/FinancePages";
import { todayMonthIso } from "@/lib/constants";

export default function MonthlySalePage() {
  return <FinanceMonthlySale todayMonthIso={todayMonthIso()} />;
}
