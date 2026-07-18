import { NextRequest } from "next/server";
import { getPackingListPage } from "@/lib/services/packingList";
import { jsonError, jsonOk, requireFastReadUser, isResponse } from "@/lib/api";
import { createPerfTimer, withServerTiming } from "@/lib/perfTiming";

export async function GET(req: NextRequest) {
  const perf = createPerfTimer("GET /api/packing-list");
  const user = await requireFastReadUser(perf);
  if (isResponse(user)) return user;
  try {
    const deliveryDate =
      req.nextUrl.searchParams.get("delivery_from") ||
      req.nextUrl.searchParams.get("delivery_date") ||
      "";
    const returnDate =
      req.nextUrl.searchParams.get("delivery_to") ||
      req.nextUrl.searchParams.get("return_date") ||
      deliveryDate;
    const category = req.nextUrl.searchParams.get("category") || "";
    perf.mark("query");
    const data = await getPackingListPage({
      deliveryFrom: deliveryDate,
      deliveryTo: returnDate,
      category,
      cursor: req.nextUrl.searchParams.get("cursor"),
      limit: Number(req.nextUrl.searchParams.get("limit") || 0) || undefined,
    });
    perf.endStage("queryMs", "query");
    return withServerTiming(jsonOk(data), perf.finish({ kind: "read" }));
  } catch {
    return jsonError("Invalid date format", 400);
  }
}
