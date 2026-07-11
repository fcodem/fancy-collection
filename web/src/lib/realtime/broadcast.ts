import { revalidateTag } from "next/cache";
import { emitShopEvent } from "./bus";
import type { ShopEventType } from "./types";

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
    try {
      // Availability lists must refresh immediately after bookings change;
      // otherwise New Booking / Free Items can show dresses that date-check
      // correctly reports as booked (stale unstable_cache for up to 30s).
      revalidateTag("dashboard-data");
      revalidateTag("available-items");
      revalidateTag("dashboard-free-items");
    } catch {
      /* ignore when cache API unavailable */
    }
  }
}
