import { NextRequest } from "next/server";
import { getPackingListCached } from "@/lib/services/operations";
import { jsonError, jsonOk, requireFastReadUser, isResponse } from "@/lib/api";
import { createPerfTimer, withServerTiming } from "@/lib/perfTiming";

export async function GET(req: NextRequest) {
  const perf = createPerfTimer("GET /api/packing-list");
  const user = await requireFastReadUser(perf);
  if (isResponse(user)) return user;
  try {
    const deliveryDate = req.nextUrl.searchParams.get("delivery_date") || "";
    const returnDate = req.nextUrl.searchParams.get("return_date") || "";
    const category = req.nextUrl.searchParams.get("category") || "";
    perf.mark("query");
    const data = await getPackingListCached(deliveryDate, returnDate, category);
    perf.endStage("queryMs", "query");
    return withServerTiming(jsonOk(data), perf.finish({ kind: "read" }));
  } catch {
    return jsonError("Invalid date format", 400);
  }
}
