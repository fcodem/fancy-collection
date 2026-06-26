import { NextRequest } from "next/server";
import { bookingDateCheck } from "@/lib/services/operations";
import { jsonError, jsonOk, requireUser, isResponse } from "@/lib/api";

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  try {
    const bookingId = parseInt(req.nextUrl.searchParams.get("booking_id") || "0", 10);
    const deliveryDate = req.nextUrl.searchParams.get("delivery_date") || "";
    const returnDate = req.nextUrl.searchParams.get("return_date") || "";
    const itemIds = req.nextUrl.searchParams.getAll("item_ids[]").map((x) => parseInt(x, 10)).filter(Boolean);
    const results = await bookingDateCheck(bookingId, deliveryDate, returnDate, itemIds);
    return jsonOk(results);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Check failed", 400);
  }
}
