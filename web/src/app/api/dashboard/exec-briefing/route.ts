import { NextRequest } from "next/server";
import { jsonOk, requireOwner, isResponse } from "@/lib/api";
import { todayIso } from "@/lib/constants";
import { cachedQuery } from "@/lib/perfCache";
import { logActivity } from "@/lib/activityLog";
import {
  generateExecBriefing,
  BRIEFING_SOURCES,
  type ExecBriefing,
} from "@/lib/services/execBriefing";

export const dynamic = "force-dynamic";

/** Cache the generated briefing for a few hours; the cache key also carries the date. */
const BRIEFING_TTL_SECONDS = 3 * 60 * 60;

/**
 * GET /api/dashboard/exec-briefing
 * Owner-only. Read-only AI executive briefing aggregated from existing analytics.
 * `?refresh=1` bypasses the per-day cache ("Refresh AI Brief").
 */
export async function GET(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  const dateIso = todayIso();
  const refresh = req.nextUrl.searchParams.get("refresh") === "1";
  const userName = user.staff?.name || user.username;

  let briefing: ExecBriefing;
  if (refresh) {
    briefing = await generateExecBriefing({ dateIso, userName });
  } else {
    briefing = await cachedQuery(
      ["exec-briefing", dateIso, String(user.id)],
      () => generateExecBriefing({ dateIso, userName }),
      BRIEFING_TTL_SECONDS,
    );
    briefing = { ...briefing, meta: { ...briefing.meta, cached: true } };
  }

  // Audit trail: capture WHO viewed, when, generation cost and analytics used —
  // never any sensitive business figures.
  logActivity({
    username: user.username,
    action: "viewed",
    entity: "ai_briefing",
    label: `AI Executive Briefing — ${dateIso}`,
    after: {
      date: dateIso,
      refresh,
      durationMs: briefing.meta.durationMs,
      sources: [...BRIEFING_SOURCES],
    },
  });

  return jsonOk(briefing);
}
