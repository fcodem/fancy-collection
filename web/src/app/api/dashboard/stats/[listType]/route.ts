import { NextRequest } from "next/server";
import { isResponse, jsonError, jsonOk, requireUserReadOnly } from "@/lib/api";
import { createPerfTimer, withServerTiming } from "@/lib/perfTiming";
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
  try {
    perf.mark("query");
    const page = await getDashboardStatListPage(listType, {
      page: sp.get("page") || undefined,
      pageSize: sp.get("pageSize") || sp.get("limit") || undefined,
    });
    perf.endStage("queryMs", "query");
    const timings = perf.finish({ kind: "read" });
    return withServerTiming(jsonOk(page), timings);
  } catch (e) {
    console.error(`[dashboard/stats/${listType}]`, e);
    return jsonError("Failed to load dashboard list", 500);
  }
}
