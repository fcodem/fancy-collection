import { revalidateTag } from "next/cache";
import { INVENTORY_CACHE_TAGS, invalidateInventoryCaches } from "@/lib/inventoryCacheTags";

export { invalidateInventoryCaches };

/** Next.js cache tags used across list/summary surfaces. */
export const CACHE_TAGS = {
  dashboard: INVENTORY_CACHE_TAGS.dashboard,
  dashboardCounts: INVENTORY_CACHE_TAGS.dashboardCounts,
  bookingList: "booking-list",
  bookingPanel: "booking-panel",
  bookingAvailability: INVENTORY_CACHE_TAGS.bookingAvailability,
  freeItems: INVENTORY_CACHE_TAGS.freeItems,
  packingList: "packing-list",
  deliveryList: "delivery-list",
  returnList: "return-list",
  inventoryList: INVENTORY_CACHE_TAGS.inventoryList,
  inventorySearch: INVENTORY_CACHE_TAGS.inventorySearch,
  customers: "customers",
  orders: "orders",
} as const;

function safeRevalidate(tags: string[]) {
  for (const tag of tags) {
    try {
      revalidateTag(tag);
    } catch {
      /* cache API unavailable in some runtimes */
    }
  }
}

export function invalidateBookingCaches() {
  safeRevalidate([
    CACHE_TAGS.bookingList,
    CACHE_TAGS.bookingPanel,
    CACHE_TAGS.bookingAvailability,
    CACHE_TAGS.freeItems,
    CACHE_TAGS.packingList,
    CACHE_TAGS.dashboard,
    CACHE_TAGS.dashboardCounts,
    CACHE_TAGS.deliveryList,
    CACHE_TAGS.returnList,
  ]);
}

export function invalidateDashboardCaches() {
  safeRevalidate([CACHE_TAGS.dashboard, CACHE_TAGS.dashboardCounts]);
}

export function invalidateCustomerCaches() {
  safeRevalidate([CACHE_TAGS.customers, CACHE_TAGS.dashboard]);
}

export function invalidateDeliveryReturnCaches() {
  safeRevalidate([
    CACHE_TAGS.deliveryList,
    CACHE_TAGS.returnList,
    CACHE_TAGS.freeItems,
    CACHE_TAGS.bookingAvailability,
    CACHE_TAGS.bookingPanel,
    CACHE_TAGS.bookingList,
    CACHE_TAGS.packingList,
    CACHE_TAGS.inventoryList,
    CACHE_TAGS.dashboard,
    CACHE_TAGS.dashboardCounts,
  ]);
}
