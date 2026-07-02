import { NextRequest } from "next/server";
import { getTopPerformersCached } from "@/lib/services/finance";
import { jsonOk, requireOwner, isResponse } from "@/lib/api";

export async function GET(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;
  const sp = req.nextUrl.searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = new Date().toISOString().slice(0, 7) + "-01";
  return jsonOk(await getTopPerformersCached(
    sp.get("from") || monthStart,
    sp.get("to") || today,
    sp.get("category") || "",
    sp.get("dress") || sp.get("q") || "",
  ));
}
