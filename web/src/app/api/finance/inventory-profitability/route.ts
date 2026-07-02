import { NextRequest } from "next/server";
import { getInventoryProfitabilityCached } from "@/lib/services/finance";
import { jsonOk, requireOwner, isResponse } from "@/lib/api";

export async function GET(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;
  const sp = req.nextUrl.searchParams;
  const from = sp.get("from") || new Date().toISOString().slice(0, 7) + "-01";
  const to = sp.get("to") || new Date().toISOString().slice(0, 10);
  return jsonOk(await getInventoryProfitabilityCached(from, to));
}
