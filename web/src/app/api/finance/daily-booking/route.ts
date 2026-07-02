import { NextRequest } from "next/server";
import { getDailyBookingCached } from "@/lib/services/finance";
import { jsonOk, requireOwner, isResponse } from "@/lib/api";

export async function GET(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;
  const date = req.nextUrl.searchParams.get("date") || new Date().toISOString().slice(0, 10);
  return jsonOk(await getDailyBookingCached(date));
}
