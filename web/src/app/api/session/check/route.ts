import { getSession } from "@/lib/auth";
import { isResponse, jsonOk, requireFastReadUser } from "@/lib/api";
import { createPerfTimer, withServerTiming } from "@/lib/perfTiming";

export async function GET() {
  const perf = createPerfTimer("GET /api/session/check");
  // Fast read auth loads the Iron Session once; only fetch it again
  // when we need pendingLoginToken for staff approval flows.
  const result = await requireFastReadUser(perf);
  const user = isResponse(result) ? null : result;
  let pendingLoginToken: string | null = null;
  if (!user) {
    const session = await getSession();
    pendingLoginToken = session.pendingLoginToken || null;
  }
  const timings = perf.finish({ kind: "read" });
  return withServerTiming(
    jsonOk({
      active: !!user,
      user: user ? { id: user.id, username: user.username, role: user.role } : null,
      pendingLoginToken,
    }),
    timings,
  );
}
