import { NextRequest } from "next/server";
import { getMonthlySaleCached } from "@/lib/services/finance";
import { handleFinanceGet } from "@/lib/finance/financeApiRoute";

export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get("month") || new Date().toISOString().slice(0, 7);
  return handleFinanceGet(() => getMonthlySaleCached(month), "Monthly sale");
}
