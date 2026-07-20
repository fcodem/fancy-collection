import { NextRequest } from "next/server";
import { universalSearchBookings } from "@/lib/services/bookingSearchCore";
import { jsonOk, requireUserReadOnly, isResponse } from "@/lib/api";
import { todayIso } from "@/lib/constants";
import { memoryCachedQuery } from "@/lib/perfCache";
import { getFreshShopRevision } from "@/lib/realtime/revision";

export async function GET(req: NextRequest) {
  const user = await requireUserReadOnly();
  if (isResponse(user)) return user;

  const queryText = req.nextUrl.searchParams.get("q")?.trim() || "";
  const date = req.nextUrl.searchParams.get("date") || todayIso();
  const category = req.nextUrl.searchParams.get("category")?.trim() || "";
  const page = req.nextUrl.searchParams.get("page");
  const pageSize = req.nextUrl.searchParams.get("pageSize");

  const revision = await getFreshShopRevision();
  const result = await memoryCachedQuery(
    ["all-record-search", revision, queryText, date, category, page || "1", pageSize || "100"],
    () => universalSearchBookings(queryText, date, category, page, pageSize),
    queryText ? 15 : 20,
  );

  const res = jsonOk(result);
  res.headers.set("Cache-Control", "private, max-age=10, stale-while-revalidate=20");
  return res;
}
