import { FinanceSecurityDeposit } from "@/components/finance/FinancePages";
import { monthStartIso, todayIso } from "@/lib/constants";

export default function SecurityDepositPage() {
  const today = todayIso();
  return <FinanceSecurityDeposit monthStartIso={monthStartIso(today)} todayIso={today} />;
}
