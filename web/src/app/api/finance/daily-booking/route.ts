import { NextRequest } from "next/server";
import { getDailyBookingCached } from "@/lib/services/finance";
import { handleFinanceGet } from "@/lib/finance/financeApiRoute";

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") || new Date().toISOString().slice(0, 10);
  return handleFinanceGet(() => getDailyBookingCached(date), "Daily booking");
}
