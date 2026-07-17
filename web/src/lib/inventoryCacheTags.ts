import { revalidateTag } from "next/cache";

/** Next.js cache tags for inventory list/search and downstream availability surfaces. */
export const INVENTORY_CACHE_TAGS = {
  inventoryList: "inventory-list",
  inventorySearch: "inventory-search",
  freeItems: "dashboard-free-items",
  bookingAvailability: "available-items",
  dashboard: "dashboard-data",
  dashboardCounts: "dashboard-counts",
} as const;

const ALL_INVENTORY_TAGS = Object.values(INVENTORY_CACHE_TAGS);

function safeRevalidate(tags: string[]) {
  for (const tag of tags) {
    try {
      revalidateTag(tag);
    } catch {
      /* cache API unavailable in some runtimes */
    }
  }
}

/** Invalidate server caches touched by inventory create/update/delete. */
export function invalidateInventoryCaches() {
  safeRevalidate(ALL_INVENTORY_TAGS);
}
