import { NextRequest } from "next/server";
import { universalSearchBookings } from "@/lib/services/bookingSearchCore";
import { jsonOk, requireUserReadOnly, isResponse } from "@/lib/api";
import { todayIso } from "@/lib/constants";
import { cachedQuery } from "@/lib/perfCache";

export async function GET(req: NextRequest) {
  const user = await requireUserReadOnly();
  if (isResponse(user)) return user;

  const queryText = req.nextUrl.searchParams.get("q")?.trim() || "";
  const date = req.nextUrl.searchParams.get("date") || todayIso();
  const category = req.nextUrl.searchParams.get("category")?.trim() || "";
  const page = req.nextUrl.searchParams.get("page");
  const pageSize = req.nextUrl.searchParams.get("pageSize");

  const result = queryText
    ? await universalSearchBookings(queryText, date, category, page, pageSize)
    : await cachedQuery(
        ["all-record-search", "year", date, category, page || "1", pageSize || "100"],
        () => universalSearchBookings(queryText, date, category, page, pageSize),
        20,
      );

  return jsonOk(result);
}
