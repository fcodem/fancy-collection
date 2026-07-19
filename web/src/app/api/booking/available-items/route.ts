import { NextRequest } from "next/server";
import {
  getAvailableItemsSearch,
  type AvailableItemsSearchResponse,
} from "@/lib/services/availabilitySearchApi";
import { jsonOk, requireFastReadUser, isResponse } from "@/lib/api";
import { createPerfTimer, withServerTiming } from "@/lib/perfTiming";

function buildSearchOpts(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const exclude = parseInt(sp.get("exclude_booking") || "0", 10) || undefined;
  return {
    deliveryDate: sp.get("delivery_date") || "",
    returnDate: sp.get("return_date") || "",
    category: sp.get("category") || "",
    excludeBookingId: exclude,
    subCategory: sp.get("subcategory") || "",
    size: sp.get("size") || "",
    itemType: sp.get("type") || "",
    group: sp.get("group") || "",
    status: sp.get("status") || "",
    search: sp.get("search") || "",
    cursor: sp.get("cursor"),
    limit: Number(sp.get("limit") || 0) || undefined,
    includeTotal: sp.get("include_total") === "1",
  };
}

function applyAuditTimings(
  perf: ReturnType<typeof createPerfTimer>,
  result: AvailableItemsSearchResponse,
) {
  const { data, cacheStatus } = result;
  perf.setCacheStatus(cacheStatus);
  perf.set("queryMs", data.audit.queryMs);
  perf.set("serializeMs", data.audit.serializeMs);
  perf.setItemCount(data.free_items.length);
  perf.addQueries(cacheStatus === "hit" ? 0 : 1);
}

export async function GET(req: NextRequest) {
  const perf = createPerfTimer("GET /api/booking/available-items");
  const user = await requireFastReadUser(perf);
  if (isResponse(user)) return user;

  const opts = buildSearchOpts(req);
  if (!opts.deliveryDate || !opts.returnDate) {
    return jsonOk({
      free_items: [],
      returning_on_delivery: [],
      booked_on_return: [],
    });
  }

  perf.mark("cache");
  const cached = await getAvailableItemsSearch(opts);
  perf.endStage("cacheLookupMs", "cache");
  applyAuditTimings(perf, cached);

  const { audit: _audit, ...payload } = cached.data;
  const timings = perf.finish({ kind: "read" });
  return withServerTiming(jsonOk(payload), timings);
}
