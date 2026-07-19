import { NextRequest } from "next/server";
import { getCategoryAnalysisCached } from "@/lib/services/finance";
import { handleFinanceGet } from "@/lib/finance/financeApiRoute";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const from = sp.get("from") || `${new Date().toISOString().slice(0, 7)}-01`;
  const to = sp.get("to") || new Date().toISOString().slice(0, 10);
  return handleFinanceGet(async () => {
    const data = await getCategoryAnalysisCached(from, to);
    if (data && typeof data === "object" && !Array.isArray(data)) {
      const categories = Array.isArray((data as { categories?: unknown }).categories)
        ? (data as { categories: unknown[] }).categories
        : [];
      return { ...data, categories };
    }
    return { categories: [] };
  }, "Category analysis");
}
