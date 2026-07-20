import { NextRequest } from "next/server";
import { getDashboardFreeItemsCached } from "@/lib/services/operations";
import { jsonOk, requireUserReadOnly, isResponse } from "@/lib/api";

export async function GET(req: NextRequest) {
  const user = await requireUserReadOnly();
  if (isResponse(user)) return user;
  const deliveryDate = req.nextUrl.searchParams.get("delivery_date") || "";
  const returnDate = req.nextUrl.searchParams.get("return_date") || "";
  const category = req.nextUrl.searchParams.get("category") || "";
  const subCategory = req.nextUrl.searchParams.get("sub_category") || "";
  const data = await getDashboardFreeItemsCached(deliveryDate, returnDate, category, subCategory);
  return jsonOk(data);
}
