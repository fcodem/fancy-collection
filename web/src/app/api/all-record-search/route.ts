import { NextRequest } from "next/server";
import { universalSearchBookings } from "@/lib/services/bookingSearchCore";
import { jsonOk, requireUserReadOnly, isResponse } from "@/lib/api";
import { todayIso } from "@/lib/constants";

export async function GET(req: NextRequest) {
  const user = await requireUserReadOnly();
  if (isResponse(user)) return user;

  const queryText = req.nextUrl.searchParams.get("q")?.trim() || "";
  const date = req.nextUrl.searchParams.get("date") || todayIso();
  const category = req.nextUrl.searchParams.get("category")?.trim() || "";

  const { mode, results } = await universalSearchBookings(queryText, date, category);
  return jsonOk({ mode, results });
}
