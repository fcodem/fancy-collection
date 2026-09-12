import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireUserReadOnly, isResponse } from "@/lib/api";
import { getBookingListDataCached } from "@/lib/services/bookingList";
import { createMenuPerfTimer } from "@/lib/menuPerf";

export async function GET(req: NextRequest) {
  const perf = createMenuPerfTimer("/api/booking-list");
  const user = await requireUserReadOnly();
  if (isResponse(user)) return user;

  const deliveryDateStr = req.nextUrl.searchParams.get("delivery_date") || "";
  const returnDateStr = req.nextUrl.searchParams.get("return_date") || "";
  const categoryFilter = req.nextUrl.searchParams.get("category") || "";
  const deliveryTimeFilter = req.nextUrl.searchParams.get("delivery_time") || "";
  const returnTimeFilter = req.nextUrl.searchParams.get("return_time") || "";
  const dressQuery = req.nextUrl.searchParams.get("q") || "";
  const page = parseInt(req.nextUrl.searchParams.get("page") || "1", 10);
  const pageSizeRaw = parseInt(req.nextUrl.searchParams.get("pageSize") || "", 10);
  const pageSize = Number.isFinite(pageSizeRaw) && pageSizeRaw > 0 ? pageSizeRaw : undefined;

  try {
    const data = await getBookingListDataCached({
      deliveryDateStr,
      returnDateStr,
      categoryFilter,
      deliveryTimeFilter,
      returnTimeFilter,
      dressQuery,
      page: Number.isFinite(page) ? page : 1,
      pageSize,
    });
    perf.finish({ kind: "read" });
    const res = jsonOk(data);
    res.headers.set("Cache-Control", "private, max-age=10, stale-while-revalidate=20");
    return res;
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Invalid request");
  }
}
