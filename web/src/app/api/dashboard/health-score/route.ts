import { NextRequest } from "next/server";
import { jsonOk, requireOwner, isResponse } from "@/lib/api";
import { todayIso } from "@/lib/constants";
import { cachedQuery } from "@/lib/perfCache";
import { logActivity } from "@/lib/activityLog";
import {
  generateHealthScore,
  HEALTH_SOURCES,
  type HealthScoreReport,
} from "@/lib/services/healthScore";

export const dynamic = "force-dynamic";

/** Cache the health score for a few hours; the cache key also carries the date. */
const HEALTH_TTL_SECONDS = 3 * 60 * 60;

/**
 * GET /api/dashboard/health-score
 * Owner-only. Read-only AI business health score derived from existing analytics.
 * `?refresh=1` bypasses the per-day cache.
 */
export async function GET(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  const dateIso = todayIso();
  const refresh = req.nextUrl.searchParams.get("refresh") === "1";
  const userName = user.staff?.name || user.username;

  let report: HealthScoreReport;
  if (refresh) {
    report = await generateHealthScore({ dateIso, userName });
  } else {
    report = await cachedQuery(
      ["health-score", dateIso, String(user.id)],
      () => generateHealthScore({ dateIso, userName }),
      HEALTH_TTL_SECONDS,
    );
    report = { ...report, meta: { ...report.meta, cached: true } };
  }

  // Audit trail: WHO viewed, when, generation cost and analytics used — never
  // any sensitive business figures (not even the score value).
  logActivity({
    username: user.username,
    action: "viewed",
    entity: "ai_briefing",
    label: `AI Health Score — ${dateIso}`,
    after: {
      date: dateIso,
      refresh,
      durationMs: report.meta.durationMs,
      sources: [...HEALTH_SOURCES],
    },
  });

  return jsonOk(report);
}
