"use client";

import { ReactNode, createContext, useCallback, useContext, useState } from "react";
import { useRouter } from "next/navigation";
import { useShopRealtime } from "@/hooks/useShopRealtime";
import { fetchJson } from "@/lib/fetchJson";
import type { ShopEvent } from "@/lib/realtime/types";

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
  const router = useRouter();
  const [onlineUsers, setOnlineUsers] = useState(0);
  const [lastEvent, setLastEvent] = useState<ShopEvent | null>(null);

  const handleEvent = useCallback(
    (event: ShopEvent) => {
      setLastEvent(event);

      if (event.type === "presence" && event.online !== undefined) {
        setOnlineUsers(event.online);
        return;
      }

      if (event.type === "nav.refresh") {
        fetchJson<{ overdue_delivery_count: number }>("/api/dashboard/nav-counts")
          .then((d) => onNavRefresh?.(d.overdue_delivery_count || 0))
          .catch(() => {});
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
      router.refresh();
    },
    [username, router, onNavRefresh],
  );

  useShopRealtime("all", handleEvent);

  return (
    <RealtimeContext.Provider value={{ onlineUsers, lastEvent }}>
      {children}
    </RealtimeContext.Provider>
  );
}
