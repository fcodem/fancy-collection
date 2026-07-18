/** Shop-wide realtime events broadcast to all connected staff browsers. */
export type ShopEventType =
  | "booking.created"
  | "booking.updated"
  | "booking.delivered"
  | "booking.returned"
  | "booking.cancelled"
  | "booking.postponed"
  | "booking.postponed_resolved"
  | "packing.updated"
  | "inventory.changed"
  /** Polling-mode signal: shop data changed (revision advanced). Not used on Ably. */
  | "shop.changed"
  | "nav.refresh"
  | "presence";

export type ShopEvent = {
  type: ShopEventType;
  bookingId?: number;
  itemIds?: number[];
  status?: string;
  by?: string;
  at: string;
  /** Connected staff browsers (presence events only). */
  online?: number;
};

export const BOOKING_EVENTS: ShopEventType[] = [
  "booking.created",
  "booking.updated",
  "booking.delivered",
  "booking.returned",
  "booking.cancelled",
  "booking.postponed",
  "booking.postponed_resolved",
  "packing.updated",
];

export const INVENTORY_EVENTS: ShopEventType[] = ["inventory.changed"];
