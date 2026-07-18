import prisma from "@/lib/prisma";
import { jsonOk, jsonError, requireUserReadOnly, isResponse } from "@/lib/api";
import { todayIso } from "@/lib/constants";
import { whereOverduePendingDelivery } from "@/lib/bookingDateQuery";
import { cachedQuery } from "@/lib/perfCache";
import { createPerfTimer, withServerTiming } from "@/lib/perfTiming";
import { CACHE_TAGS } from "@/lib/cacheInvalidation";

/** Nav badge counts — tagged cache ~45s (not financial). */
export async function GET() {
  const perf = createPerfTimer("GET /api/dashboard/nav-counts");
  perf.mark("auth");
  const user = await requireUserReadOnly();
  perf.endStage("cookieAuthMs", "auth");
  perf.endStage("authMs", "auth");
  if (isResponse(user)) return user;

  try {
    perf.mark("query");
    const overdueDeliveryCount = await cachedQuery(
      [CACHE_TAGS.dashboardCounts, "nav-overdue-delivery", todayIso()],
      async () =>
        prisma.booking.count({
          where: await whereOverduePendingDelivery(todayIso()),
        }),
      45,
    );
    perf.endStage("queryMs", "query");
    perf.addQueries(1);
    const timings = perf.finish({ kind: "read" });
    return withServerTiming(jsonOk({ overdue_delivery_count: overdueDeliveryCount }), timings);
  } catch (e) {
    console.error("[nav-counts]", e);
    const msg = e instanceof Error ? e.message : "";
    if (/P1001|Can't reach database|ECONNREFUSED|ETIMEDOUT/i.test(msg)) {
      return jsonError("The database is temporarily unavailable. Please try again.", 503);
    }
    return jsonError("Failed to load navigation counts", 500);
  }
}
