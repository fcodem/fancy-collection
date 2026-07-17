"use client";

import { ReactNode, createContext, useCallback, useContext, useRef, useState } from "react";
import { useShopRealtime } from "@/hooks/useShopRealtime";
import { fetchJson } from "@/lib/fetchJson";
import type { ShopEvent } from "@/lib/realtime/types";

let navCountsTimer: ReturnType<typeof setTimeout> | null = null;

type RealtimeContextValue = {
  onlineUsers: number;
  lastEvent: ShopEvent | null;
};

const RealtimeContext = createContext<RealtimeContextValue>({
  onlineUsers: 0,
  lastEvent: null,
});

export function useRealtime() {
  return useContext(RealtimeContext);
}

const EVENT_LABELS: Partial<Record<ShopEvent["type"], string>> = {
  "booking.created": "New booking saved",
  "booking.updated": "Booking updated",
  "booking.delivered": "Dress delivered",
  "booking.returned": "Dress returned",
  "booking.cancelled": "Booking cancelled",
  "booking.postponed": "Booking postponed",
  "booking.postponed_resolved": "Postponed booking resolved",
  "packing.updated": "Packing list updated",
  "inventory.changed": "Inventory updated",
};

export default function RealtimeProvider({
  children,
  username,
  onNavRefresh,
}: {
  children: ReactNode;
  username: string;
  onNavRefresh?: (count: number) => void;
}) {
  const [onlineUsers, setOnlineUsers] = useState(0);
  const [lastEvent, setLastEvent] = useState<ShopEvent | null>(null);
  const onNavRefreshRef = useRef(onNavRefresh);
  onNavRefreshRef.current = onNavRefresh;

  const scheduleNavCounts = useCallback(() => {
    if (typeof document !== "undefined" && document.hidden) return;
    if (navCountsTimer) clearTimeout(navCountsTimer);
    navCountsTimer = setTimeout(() => {
      navCountsTimer = null;
      fetchJson<{ overdue_delivery_count: number }>("/api/dashboard/nav-counts", {
        dedupeMs: 60_000,
      })
        .then((d) => onNavRefreshRef.current?.(d.overdue_delivery_count || 0))
        .catch(() => {});
    }, 2500);
  }, []);

  const handleEvent = useCallback(
    (event: ShopEvent) => {
      setLastEvent(event);

      if (event.type === "presence" && event.online !== undefined) {
        setOnlineUsers(event.online);
        return;
      }

      // Polling mode only emits nav.refresh — presence badge stays hidden (online < 2).

      if (event.type === "nav.refresh") {
        scheduleNavCounts();
        window.dispatchEvent(new CustomEvent("shop-realtime", { detail: event }));
        return;
      }

      // Own saves/updates navigate away locally — refreshing the current page would reset forms.
      if (event.by && event.by === username) {
        window.dispatchEvent(new CustomEvent("shop-realtime", { detail: event }));
        return;
      }

      if (event.by && event.by !== username) {
        const label = EVENT_LABELS[event.type];
        if (label) {
          window.dispatchEvent(
            new CustomEvent("shop-realtime-toast", {
              detail: { message: `${event.by}: ${label}`, type: "info" },
            }),
          );
        }
      }

      window.dispatchEvent(new CustomEvent("shop-realtime", { detail: event }));
    },
    [username, scheduleNavCounts],
  );

  useShopRealtime("all", handleEvent);

  return (
    <RealtimeContext.Provider value={{ onlineUsers, lastEvent }}>
      {children}
    </RealtimeContext.Provider>
  );
}
