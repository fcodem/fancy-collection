import { revalidateTag } from "next/cache";
import { INVENTORY_CACHE_TAGS, invalidateInventoryCaches } from "@/lib/inventoryCacheTags";
import { clearMemoryCache } from "@/lib/perfCache";
import { clearQrResolveCache } from "@/lib/services/qrResolve";

export { invalidateInventoryCaches };

/** Next.js cache tags used across list/summary surfaces. */
export const CACHE_TAGS = {
  dashboard: INVENTORY_CACHE_TAGS.dashboard,
  dashboardCounts: INVENTORY_CACHE_TAGS.dashboardCounts,
  bookingList: "booking-list",
  bookingPanel: "booking-panel",
  bookingRecord: "booking-record",
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
  // In-process memory TTL must not outlive tagged invalidation.
  clearMemoryCache();
}

export function invalidateBookingCaches() {
  safeRevalidate([
    CACHE_TAGS.bookingList,
    CACHE_TAGS.bookingPanel,
    CACHE_TAGS.bookingRecord,
    CACHE_TAGS.bookingAvailability,
    CACHE_TAGS.freeItems,
    CACHE_TAGS.packingList,
    CACHE_TAGS.dashboard,
    CACHE_TAGS.dashboardCounts,
    CACHE_TAGS.deliveryList,
    CACHE_TAGS.returnList,
  ]);
  // A created/edited/deleted booking may change or retire a qr_token → id mapping.
  clearQrResolveCache();
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
  // Delivery/return mutate booking status; keep QR resolver mapping fresh too.
  clearQrResolveCache();
}
