import { NextRequest } from "next/server";
import { jsonOk, requireFastReadUser, isResponse } from "@/lib/api";
import { createPerfTimer, withServerTiming } from "@/lib/perfTiming";
import { listInventoryGroups } from "@/lib/services/inventoryList";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const perf = createPerfTimer("GET /api/inventory/list");
  const user = await requireFastReadUser(perf);
  if (isResponse(user)) return user;

  perf.mark("parse");
  const sp = req.nextUrl.searchParams;
  const cursor = sp.get("cursor");
  const limit = Number(sp.get("limit") || 0) || undefined;
  const q = sp.get("q") || "";
  const category = sp.get("category") || "";
  const status = sp.get("status") || "";
  const sort = sp.get("sort") === "newest" ? "newest" : "name";
  perf.endStage("parseMs", "parse");

  perf.mark("query");
  const result = await listInventoryGroups({ cursor, limit, q, category, status, sort });
  perf.endStage("queryMs", "query");
  perf.setItemCount(result.rowCount);
  perf.addQueries(1);

  const timings = perf.finish({ kind: "read" });
  const headers = new Headers();
  headers.set("Cache-Control", "private, max-age=15, stale-while-revalidate=30");
  const res = jsonOk({
    groups: result.groups,
    nextCursor: result.nextCursor,
    rowCount: result.rowCount,
    cacheStatus: "miss",
  });
  // Preserve json body + add Server-Timing
  const timed = withServerTiming(res, timings);
  timed.headers.set("Cache-Control", "private, max-age=15, stale-while-revalidate=30");
  return timed;
}
