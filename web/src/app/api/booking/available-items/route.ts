import { NextRequest } from "next/server";
import { searchAvailableItems } from "@/lib/services/availabilitySearch";
import { jsonOk, requireFastReadUser, isResponse } from "@/lib/api";
import { createPerfTimer, withServerTiming } from "@/lib/perfTiming";

export async function GET(req: NextRequest) {
  const perf = createPerfTimer("GET /api/booking/available-items");
  const user = await requireFastReadUser(perf);
  if (isResponse(user)) return user;

  const deliveryDate = req.nextUrl.searchParams.get("delivery_date") || "";
  const returnDate = req.nextUrl.searchParams.get("return_date") || "";
  const category = req.nextUrl.searchParams.get("category") || "";

  if (!deliveryDate || !returnDate) {
    return jsonOk({ free_items: [], returning_items: [], booked_on_return: [] });
  }

  const exclude = parseInt(req.nextUrl.searchParams.get("exclude_booking") || "0", 10) || undefined;
  perf.mark("db");
  // One live, bounded CTE query — New Booking must never show occupied inventory.
  const data = await searchAvailableItems({
    deliveryDate,
    returnDate,
    category,
    excludeBookingId: exclude,
    subCategory: req.nextUrl.searchParams.get("subcategory") || "",
    size: req.nextUrl.searchParams.get("size") || "",
    itemType: req.nextUrl.searchParams.get("type") || "",
    group: req.nextUrl.searchParams.get("group") || "",
    status: req.nextUrl.searchParams.get("status") || "",
    search: req.nextUrl.searchParams.get("search") || "",
    cursor: req.nextUrl.searchParams.get("cursor"),
    limit: Number(req.nextUrl.searchParams.get("limit") || 0) || undefined,
  });
  perf.endStage("initialReadMs", "db");
  const timings = perf.finish({ kind: "read" });
  return withServerTiming(jsonOk(data), timings);
}
