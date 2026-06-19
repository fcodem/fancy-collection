import { FinanceDailyBooking } from "@/components/finance/FinancePages";
import { todayIso } from "@/lib/constants";

export default function DailyBookingPage() {
  return <FinanceDailyBooking todayIso={todayIso()} />;
}
