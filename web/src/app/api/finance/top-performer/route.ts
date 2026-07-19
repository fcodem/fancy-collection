import { NextRequest } from "next/server";
import { getTopPerformersCached } from "@/lib/services/finance";
import { handleFinanceGet } from "@/lib/finance/financeApiRoute";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = `${new Date().toISOString().slice(0, 7)}-01`;
  return handleFinanceGet(async () => {
    const rows = await getTopPerformersCached(
      sp.get("from") || monthStart,
      sp.get("to") || today,
      sp.get("category") || "",
      sp.get("dress") || sp.get("q") || "",
    );
    return Array.isArray(rows) ? rows : [];
  }, "Top performer");
}
