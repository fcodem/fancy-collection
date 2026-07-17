import { emitShopEvent } from "./bus";
import type { ShopEventType } from "./types";
import {
  invalidateBookingCaches,
  invalidateDeliveryReturnCaches,
} from "@/lib/cacheInvalidation";
import { invalidateInventoryCaches } from "@/lib/inventoryCacheTags";

type BroadcastOpts = {
  type: ShopEventType;
  bookingId?: number;
  itemIds?: number[];
  status?: string;
  by?: string;
};

/** Broadcast a change to all connected staff browsers (Ably, SSE, or polling clients). */
export function broadcastShopEvent(opts: BroadcastOpts) {
  emitShopEvent({
    ...opts,
    at: new Date().toISOString(),
  });
  if (
    opts.type.startsWith("booking.") ||
    opts.type === "packing.updated" ||
    opts.type === "inventory.changed"
  ) {
    emitShopEvent({ type: "nav.refresh", at: new Date().toISOString() });
    if (opts.type === "inventory.changed") {
      invalidateInventoryCaches();
    } else if (
      opts.type === "booking.delivered" ||
      opts.type === "booking.returned" ||
      opts.type.includes("return")
    ) {
      invalidateDeliveryReturnCaches();
    } else {
      invalidateBookingCaches();
    }
  }
}
