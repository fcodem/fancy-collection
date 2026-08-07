import { jsonOk, requireUser, isResponse } from "@/lib/api";
import { getPublicHealthStatus } from "@/lib/dressChecker/publicHealthStatus";

export const dynamic = "force-dynamic";

/** Lightweight AI queue stats — loaded client-side so dashboard SSR does not compete for DB pool slots. */
export async function GET() {
  const user = await requireUser();
  if (isResponse(user)) return user;

  const status = await getPublicHealthStatus({ selfHeal: true });
  return jsonOk({
    queued:
      (status.queue?.pending ?? 0) +
      (status.queue?.processing ?? 0) +
      (status.queue?.retrying ?? 0),
    failed: status.failedJobCount ?? 0,
    ready: status.readyProfiles ?? status.ai?.READY ?? 0,
    unindexed: status.unindexedWithPhoto ?? 0,
    banner: status.banner,
    bannerLevel: status.bannerLevel,
  });
}
