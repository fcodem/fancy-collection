import { NextRequest } from "next/server";
import { getAvailableItemsApi } from "@/lib/booking";
import { jsonOk, requireUserReadOnly, isResponse } from "@/lib/api";

export async function GET(req: NextRequest) {
  const user = await requireUserReadOnly();
  if (isResponse(user)) return user;

  const deliveryDate = req.nextUrl.searchParams.get("delivery_date") || "";
  const returnDate = req.nextUrl.searchParams.get("return_date") || "";
  const category = req.nextUrl.searchParams.get("category") || "";

  if (!deliveryDate || !returnDate) {
    return jsonOk({ free_items: [], returning_items: [], booked_on_return: [] });
  }

  const exclude = parseInt(req.nextUrl.searchParams.get("exclude_booking") || "0", 10) || undefined;
  // Live DB read — New Booking must not show dresses that are already booked.
  // (Cached path remains available for non-critical consumers via getAvailableItemsApiCached.)
  const data = await getAvailableItemsApi(deliveryDate, returnDate, category, exclude);
  return jsonOk(data);
}
