import { NextRequest } from "next/server";
import { getAvailableItemsApi } from "@/lib/booking";
import { jsonOk } from "@/lib/api";
import { debugLog } from "@/lib/debugLog";

export async function GET(req: NextRequest) {
  const deliveryDate = req.nextUrl.searchParams.get("delivery_date") || "";
  const returnDate = req.nextUrl.searchParams.get("return_date") || "";
  const category = req.nextUrl.searchParams.get("category") || "";

  if (!deliveryDate || !returnDate) {
    return jsonOk({ free_items: [], returning_items: [], booked_on_return: [] });
  }

  const exclude = parseInt(req.nextUrl.searchParams.get("exclude_booking") || "0", 10) || undefined;
  const data = await getAvailableItemsApi(deliveryDate, returnDate, category, exclude);
  const freeCount = data.free_items?.length ?? 0;
  const dualWarn = (data.free_items || []).filter((i) => i.returning_warning && i.booked_warning).length;
  // #region agent log
  debugLog("available-items/route.ts", "availability loaded", {
    deliveryDate,
    returnDate,
    category: category || "(all)",
    freeCount,
    dualWarn,
  }, "A");
  // #endregion
  return jsonOk(data);
}
