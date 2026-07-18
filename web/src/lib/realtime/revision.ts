import "server-only";

import prisma from "@/lib/prisma";
import { memoryCachedQuery } from "@/lib/perfCache";

/**
 * Cheap monotonic shop revision for polling-mode realtime.
 *
 * Clients poll this instead of fabricating a synthetic `nav.refresh` every
 * interval. Lists/refetches only fire when the revision actually changes
 * (i.e. a staff mutation wrote an activity log row).
 *
 * Short in-process TTL coalesces many concurrent idle tabs on the same
 * warm instance without hiding real changes for long.
 */
export async function getShopRevision(): Promise<string> {
  return memoryCachedQuery(
    ["shop-realtime-revision"],
    async () => {
      const latest = await prisma.activityLog.findFirst({
        orderBy: { id: "desc" },
        select: { id: true },
      });
      return String(latest?.id ?? 0);
    },
    5,
  );
}
