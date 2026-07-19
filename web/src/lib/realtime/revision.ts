import "server-only";

import prisma from "@/lib/prisma";
import { memoryCachedQuery } from "@/lib/perfCache";

let freshRevisionInflight: Promise<string> | null = null;

/**
 * Uncached mutation revision for correctness-sensitive short caches.
 * Simultaneous callers share only the in-flight query; once it settles, the
 * next request reads the database again so a booking mutation cannot remain
 * hidden behind the polling cache's five-second TTL.
 */
export function getFreshShopRevision(): Promise<string> {
  if (freshRevisionInflight) return freshRevisionInflight;
  freshRevisionInflight = prisma.activityLog
    .findFirst({
      orderBy: { id: "desc" },
      select: { id: true },
    })
    .then((latest) => String(latest?.id ?? 0))
    .finally(() => {
      freshRevisionInflight = null;
    });
  return freshRevisionInflight;
}

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
    getFreshShopRevision,
    5,
  );
}
