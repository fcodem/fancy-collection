import { NextRequest } from "next/server";
import { getNextSerialForDate } from "@/lib/services/bookingCrud";
import { jsonOk, requireUserReadOnly, isResponse } from "@/lib/api";

export async function GET(req: NextRequest) {
  const user = await requireUserReadOnly();
  if (isResponse(user)) return user;

  const sp = req.nextUrl.searchParams;
  const date =
    sp.get("delivery_date") ||
    sp.get("date") ||
    new Date().toISOString().slice(0, 10);
  const data = await getNextSerialForDate(date);
  return jsonOk(data);
}
