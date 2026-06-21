import { NextRequest } from "next/server";
import { getAvailableItemsApi } from "@/lib/booking";
import { jsonOk } from "@/lib/api";

export async function GET(req: NextRequest) {
  const deliveryDate = req.nextUrl.searchParams.get("delivery_date") || "";
  const returnDate = req.nextUrl.searchParams.get("return_date") || "";
  const category = req.nextUrl.searchParams.get("category") || "";

  if (!deliveryDate || !returnDate) {
    return jsonOk({ free_items: [], returning_items: [], booked_on_return: [] });
  }

  const exclude = parseInt(req.nextUrl.searchParams.get("exclude_booking") || "0", 10) || undefined;
  const data = await getAvailableItemsApi(deliveryDate, returnDate, category, exclude);
  return jsonOk(data);
}
