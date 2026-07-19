import { NextRequest } from "next/server";
import { getYearlySaleCached } from "@/lib/services/finance";
import { handleFinanceGet } from "@/lib/finance/financeApiRoute";

export async function GET(req: NextRequest) {
  return handleFinanceGet(
    () =>
      getYearlySaleCached(
        req.nextUrl.searchParams.get("from") || undefined,
        req.nextUrl.searchParams.get("to") || undefined,
      ),
    "Yearly sale",
  );
}
