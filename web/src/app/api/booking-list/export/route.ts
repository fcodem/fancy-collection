import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireUserReadOnly, isResponse } from "@/lib/api";
import { getBookingListExportData } from "@/lib/services/bookingList";

export async function GET(req: NextRequest) {
  const user = await requireUserReadOnly();
  if (isResponse(user)) return user;

  const deliveryDateStr = req.nextUrl.searchParams.get("delivery_date") || "";
  const returnDateStr = req.nextUrl.searchParams.get("return_date") || "";
  const categoryFilter = req.nextUrl.searchParams.get("category") || "";
  const deliveryTimeFilter = req.nextUrl.searchParams.get("delivery_time") || "";
  const returnTimeFilter = req.nextUrl.searchParams.get("return_time") || "";

  try {
    const data = await getBookingListExportData({
      deliveryDateStr,
      returnDateStr,
      categoryFilter,
      deliveryTimeFilter,
      returnTimeFilter,
    });
    return jsonOk(data);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Export failed");
  }
}
