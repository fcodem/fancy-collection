import { FinanceCategoryAnalysis } from "@/components/finance/FinancePages";
import { monthStartIso, todayIso } from "@/lib/constants";

export default function CategoryAnalysisPage() {
  const today = todayIso();
  return <FinanceCategoryAnalysis monthStartIso={monthStartIso(today)} todayIso={today} />;
}
