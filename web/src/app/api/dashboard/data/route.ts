import { getDashboardData } from "@/lib/services/core";
import { jsonOk, jsonError, requireUserReadOnly, isResponse } from "@/lib/api";
import { createPerfTimer, withServerTiming } from "@/lib/perfTiming";

/** Cached dashboard JSON (~60s). Mutations never use this path. */
export async function GET() {
  const perf = createPerfTimer("GET /api/dashboard/data");
  perf.mark("auth");
  const user = await requireUserReadOnly();
  perf.endStage("cookieAuthMs", "auth");
  perf.endStage("authMs", "auth");
  if (isResponse(user)) return user;

  try {
    perf.mark("query");
    const data = await getDashboardData();
    perf.endStage("queryMs", "query");
    perf.setCacheStatus("hit"); // underlying layer may miss; status refined later
    const timings = perf.finish({ kind: "read" });
    return withServerTiming(jsonOk(data), timings);
  } catch (e) {
    console.error("[dashboard/data]", e);
    const msg = e instanceof Error ? e.message : "";
    if (/P1001|Can't reach database|ECONNREFUSED|ETIMEDOUT/i.test(msg)) {
      return jsonError("The database is temporarily unavailable. Please try again.", 503);
    }
    return jsonError("Failed to load dashboard data", 500);
  }
}
