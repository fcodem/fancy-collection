import { NextRequest } from "next/server";
import { getDailySaleCached } from "@/lib/services/finance";
import { handleFinanceGet } from "@/lib/finance/financeApiRoute";

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") || new Date().toISOString().slice(0, 10);
  return handleFinanceGet(() => getDailySaleCached(date), "Daily sale");
}
