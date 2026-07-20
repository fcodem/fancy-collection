"use client";

import { useRouter } from "next/navigation";
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh";
import { BOOKING_EVENTS, INVENTORY_EVENTS, type ShopEventType } from "@/lib/realtime/types";

const ALL_DATA_EVENTS: ShopEventType[] = [...BOOKING_EVENTS, ...INVENTORY_EVENTS];

/**
 * Drop into any server-rendered page to auto-refresh when other devices
 * create/update/delete bookings or inventory.  Renders nothing visible.
 */
export default function RealtimePageRefresher({
  events = ALL_DATA_EVENTS,
}: {
  events?: ShopEventType[];
}) {
  const router = useRouter();
  useRealtimeRefresh(events, () => router.refresh());
  return null;
}
