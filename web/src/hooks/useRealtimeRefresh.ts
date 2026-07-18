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
 *
 * `nav.refresh` is intentionally ignored here — it is reserved for the shell
 * nav-badge path. List refreshes only happen on matching domain events or on
 * polling-mode `shop.changed` (revision advanced).
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
      if (event.type === "shop.changed" || typesRef.current.includes(event.type)) {
        const jitter = Math.floor(Math.random() * 800);
        setTimeout(() => safeRefresh(() => refreshRef.current()), jitter);
      }
    };

    window.addEventListener("shop-realtime", handler);
    return () => window.removeEventListener("shop-realtime", handler);
  }, []);
}
