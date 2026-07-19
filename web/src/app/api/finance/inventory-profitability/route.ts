import { NextRequest } from "next/server";
import { getInventoryProfitabilityCached } from "@/lib/services/finance";
import { handleFinanceGet } from "@/lib/finance/financeApiRoute";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const from = sp.get("from") || `${new Date().toISOString().slice(0, 7)}-01`;
  const to = sp.get("to") || new Date().toISOString().slice(0, 10);
  return handleFinanceGet(async () => {
    const data = await getInventoryProfitabilityCached(from, to);
    if (data && typeof data === "object") {
      const row = data as {
        category_breakdown?: unknown;
        totals?: unknown;
      };
      return {
        ...row,
        category_breakdown: Array.isArray(row.category_breakdown) ? row.category_breakdown : [],
        totals: row.totals ?? {
          itemCount: 0,
          itemsWithRevenue: 0,
          totalRevenue: 0,
          totalBookings: 0,
        },
      };
    }
    return {
      category_breakdown: [],
      totals: { itemCount: 0, itemsWithRevenue: 0, totalRevenue: 0, totalBookings: 0 },
    };
  }, "Inventory profitability");
}
