"use client";

import { useEffect, useRef } from "react";
import type { ShopEvent, ShopEventType } from "@/lib/realtime/types";
import { PAGE_OPEN_REFRESH_EVENT } from "@/lib/pageOpenRefresh";

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
 * Re-fetch list/search data when:
 * - RealtimeProvider receives matching shop events, or
 * - the user opens a menu / returns to the tab (PAGE_OPEN_REFRESH_EVENT).
 *
 * `nav.refresh` is intentionally ignored here — it is reserved for the shell
 * nav-badge path. List refreshes only happen on matching domain events,
 * polling-mode `shop.changed`, or explicit page-open refresh.
 */
export function useRealtimeRefresh(types: ShopEventType[], refresh: () => void) {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const typesRef = useRef(types);
  typesRef.current = types;

  useEffect(() => {
    const onShopEvent = (e: Event) => {
      if (typeof document !== "undefined" && document.hidden) return;
      const event = (e as CustomEvent<ShopEvent>).detail;
      if (!event) return;
      if (event.type === "shop.changed" || typesRef.current.includes(event.type)) {
        const jitter = Math.floor(Math.random() * 200);
        setTimeout(() => safeRefresh(() => refreshRef.current()), jitter);
      }
    };

    const onPageOpen = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      safeRefresh(() => refreshRef.current());
    };

    window.addEventListener("shop-realtime", onShopEvent);
    window.addEventListener(PAGE_OPEN_REFRESH_EVENT, onPageOpen);
    return () => {
      window.removeEventListener("shop-realtime", onShopEvent);
      window.removeEventListener(PAGE_OPEN_REFRESH_EVENT, onPageOpen);
    };
  }, []);
}
