"use client";

import { useRouter } from "next/navigation";
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh";
import { BOOKING_EVENTS, INVENTORY_EVENTS, type ShopEventType } from "@/lib/realtime/types";

const ALL_DATA_EVENTS: ShopEventType[] = [...BOOKING_EVENTS, ...INVENTORY_EVENTS];

/**
 * Drop into any server-rendered page to auto-refresh when other devices
 * change data. Renders nothing visible.
 * Menu opens use soft navigation + staleTimes — do not refresh on every page-open.
 */
export default function RealtimePageRefresher({
  events = ALL_DATA_EVENTS,
}: {
  events?: ShopEventType[];
}) {
  const router = useRouter();
  useRealtimeRefresh(events, () => router.refresh(), { refreshOnPageOpen: false });
  return null;
}
