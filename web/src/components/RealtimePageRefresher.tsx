"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh";
import { BOOKING_EVENTS, INVENTORY_EVENTS, type ShopEventType } from "@/lib/realtime/types";

const ALL_DATA_EVENTS: ShopEventType[] = [...BOOKING_EVENTS, ...INVENTORY_EVENTS];

/**
 * Drop into any server-rendered page to auto-refresh when other devices
 * change data. Renders nothing visible.
 * When `refreshOnPageOpen` is true, also re-fetch once on mount (e.g. booking panel
 * after editing a booking) and on menu/focus page-open events.
 */
export default function RealtimePageRefresher({
  events = ALL_DATA_EVENTS,
  refreshOnPageOpen = false,
}: {
  events?: ShopEventType[];
  refreshOnPageOpen?: boolean;
}) {
  const router = useRouter();
  useRealtimeRefresh(events, () => router.refresh(), { refreshOnPageOpen });

  useEffect(() => {
    if (!refreshOnPageOpen) return;
    router.refresh();
  }, [refreshOnPageOpen, router]);

  return null;
}
