import { NextRequest } from "next/server";
import { getPackingList } from "@/lib/services/operations";
import { jsonError, jsonOk, requireUserReadOnly, isResponse } from "@/lib/api";

export async function GET(req: NextRequest) {
  const user = await requireUserReadOnly();
  if (isResponse(user)) return user;
  try {
    const deliveryDate = req.nextUrl.searchParams.get("delivery_date") || "";
    const returnDate = req.nextUrl.searchParams.get("return_date") || "";
    const category = req.nextUrl.searchParams.get("category") || "";
    const data = await getPackingList(deliveryDate, returnDate, category);
    return jsonOk(data);
  } catch {
    return jsonError("Invalid date format", 400);
  }
}
