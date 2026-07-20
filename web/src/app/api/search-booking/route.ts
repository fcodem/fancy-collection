import { NextRequest } from "next/server";
import { monthBasedSearchBookings } from "@/lib/services/bookingSearchCore";
import { jsonOk, requireUserReadOnly, isResponse } from "@/lib/api";
import { todayIso } from "@/lib/constants";
import { createPerfTimer, withServerTiming } from "@/lib/perfTiming";
import { memoryCachedQuery } from "@/lib/perfCache";
import { getFreshShopRevision } from "@/lib/realtime/revision";

export async function GET(req: NextRequest) {
  const perf = createPerfTimer("/api/search-booking");
  perf.mark("auth");
  const user = await requireUserReadOnly();
  if (isResponse(user)) return user;
  perf.endStage("authMs", "auth");

  const queryText = req.nextUrl.searchParams.get("q")?.trim() || "";
  const date = req.nextUrl.searchParams.get("date") || todayIso();
  const category = req.nextUrl.searchParams.get("category")?.trim() || "";
  const page = req.nextUrl.searchParams.get("page");
  const pageSize = req.nextUrl.searchParams.get("pageSize");

  if (queryText.length > 0 && queryText.length < 2 && !/^\d+$/.test(queryText)) {
    return jsonOk({ mode: "mixed", results: [], total: 0, page: 1, pageSize: 20, hasMore: false, totalExact: true });
  }

  perf.mark("search");
  const revision = await getFreshShopRevision();
  const result = await memoryCachedQuery(
    ["search-booking", revision, queryText, date, category, page || "", pageSize || ""],
    () => monthBasedSearchBookings(queryText, date, category, page, pageSize),
    15,
  );
  perf.endStage("queryMs", "search");
  perf.addQueries(1);

  const res = jsonOk(result);
  res.headers.set("Cache-Control", "private, max-age=10, stale-while-revalidate=20");
  return withServerTiming(res, perf.finish({ kind: "read" }));
}
