import { NextRequest } from "next/server";
import { getSecurityDepositSummaryCached } from "@/lib/services/finance";
import { handleFinanceGet } from "@/lib/finance/financeApiRoute";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const from = sp.get("from") || `${new Date().toISOString().slice(0, 7)}-01`;
  const to = sp.get("to") || new Date().toISOString().slice(0, 10);
  return handleFinanceGet(async () => {
    const data = await getSecurityDepositSummaryCached(from, to);
    if (data && typeof data === "object") {
      const row = data as { bookings?: unknown; total_collected?: number; total_held?: number; total_returned?: number };
      return {
        ...row,
        total_collected: row.total_collected ?? 0,
        total_held: row.total_held ?? 0,
        total_returned: row.total_returned ?? 0,
        bookings: Array.isArray(row.bookings) ? row.bookings : [],
      };
    }
    return {
      from,
      to,
      total_collected: 0,
      total_held: 0,
      total_returned: 0,
      bookings: [],
    };
  }, "Security deposit");
}
