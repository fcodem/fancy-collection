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

const INVENTORY_ONLY_TAGS = [
  INVENTORY_CACHE_TAGS.inventoryList,
  INVENTORY_CACHE_TAGS.inventorySearch,
] as const;

const ALL_INVENTORY_TAGS = Object.values(INVENTORY_CACHE_TAGS);

function safeRevalidate(tags: readonly string[]) {
  for (const tag of tags) {
    try {
      revalidateTag(tag);
    } catch {
      /* cache API unavailable in some runtimes */
    }
  }
}

/**
 * Light invalidation: only inventory list/search caches.
 * Use after create/update when dashboard will refresh via nav.refresh event.
 */
export function invalidateInventoryListCaches() {
  safeRevalidate(INVENTORY_ONLY_TAGS);
}

/** Full invalidation including dashboard/availability (use sparingly, e.g. status change or delete). */
export function invalidateInventoryCaches() {
  safeRevalidate(ALL_INVENTORY_TAGS);
}
