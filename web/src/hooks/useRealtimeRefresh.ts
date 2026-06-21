"use client";

import { useEffect, useRef } from "react";
import type { ShopEvent, ShopEventType } from "@/lib/realtime/types";

function safeRefresh(refresh: () => void) {
  try {
    const result = refresh();
    if (result != null && typeof (result as Promise<unknown>).catch === "function") {
      (result as Promise<unknown>).catch(() => {});
    }
  } catch {
    /* ignore refresh errors — polling must not crash the page */
  }
}

/**
 * Re-fetch list/search data when RealtimeProvider receives shop events.
 * Uses a single poll from useShopRealtime — no duplicate setInterval per page.
 */
export function useRealtimeRefresh(types: ShopEventType[], refresh: () => void) {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const typesRef = useRef(types);
  typesRef.current = types;

  useEffect(() => {
    const handler = (e: Event) => {
      if (typeof document !== "undefined" && document.hidden) return;
      const event = (e as CustomEvent<ShopEvent>).detail;
      if (!event) return;
      if (event.type === "nav.refresh" || typesRef.current.includes(event.type)) {
        safeRefresh(() => refreshRef.current());
      }
    };

    window.addEventListener("shop-realtime", handler);
    return () => window.removeEventListener("shop-realtime", handler);
  }, []);
}
