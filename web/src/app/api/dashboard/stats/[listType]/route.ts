import { NextRequest } from "next/server";
import { isResponse, jsonError, jsonOk, requireUserReadOnly } from "@/lib/api";
import { createPerfTimer, withServerTiming } from "@/lib/perfTiming";
import { memoryCachedQuery } from "@/lib/perfCache";
import { getFreshShopRevision } from "@/lib/realtime/revision";
import {
  getDashboardStatListPage,
  parseDashboardStatListType,
} from "@/lib/services/dashboardStatLists";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ listType: string }> },
) {
  const perf = createPerfTimer("GET /api/dashboard/stats/[listType]");
  perf.mark("auth");
  const user = await requireUserReadOnly();
  perf.endStage("cookieAuthMs", "auth");
  perf.endStage("authMs", "auth");
  if (isResponse(user)) return user;

  const { listType: raw } = await ctx.params;
  const listType = parseDashboardStatListType(raw);
  if (!listType) return jsonError("Unknown dashboard stat list", 404);

  const sp = req.nextUrl.searchParams;
  const pageParam = sp.get("page") || "";
  const pageSizeParam = sp.get("pageSize") || sp.get("limit") || "";
  try {
    perf.mark("query");
    const revision = await getFreshShopRevision();
    const page = await memoryCachedQuery(
      ["dashboard-stat", revision, listType, pageParam, pageSizeParam],
      () => getDashboardStatListPage(listType, {
        page: pageParam || undefined,
        pageSize: pageSizeParam || undefined,
      }),
      10,
    );
    perf.endStage("queryMs", "query");
    const timings = perf.finish({ kind: "read" });
    const res = jsonOk(page);
    res.headers.set("Cache-Control", "private, max-age=10, stale-while-revalidate=20");
    return withServerTiming(res, timings);
  } catch (e) {
    console.error(`[dashboard/stats/${listType}]`, e);
    return jsonError("Failed to load dashboard list", 500);
  }
}
