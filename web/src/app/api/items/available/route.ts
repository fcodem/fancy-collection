import { NextRequest } from "next/server";
import { jsonOk, requireFastReadUser, isResponse } from "@/lib/api";
import { searchAvailableItems } from "@/lib/services/availabilitySearch";
import { todayIso } from "@/lib/constants";

export async function GET(req: NextRequest) {
  const user = await requireFastReadUser();
  if (isResponse(user)) return user;
  const sp = req.nextUrl.searchParams;
  const deliveryDate = sp.get("delivery_date") || todayIso();
  const returnDate = sp.get("return_date") || deliveryDate;
  const data = await searchAvailableItems({
    deliveryDate,
    returnDate,
    category: sp.get("category") || "",
    subCategory: sp.get("subcategory") || "",
    size: sp.get("size") || "",
    itemType: sp.get("type") || "",
    group: sp.get("group") || "",
    search: sp.get("search") || "",
    cursor: sp.get("cursor"),
    limit: Number(sp.get("limit") || 0) || undefined,
  });
  return jsonOk(data);
}
