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
 * - (optional) the user opens a menu / returns to the tab (PAGE_OPEN_REFRESH_EVENT).
 *
 * `nav.refresh` is intentionally ignored here — it is reserved for the shell
 * nav-badge path. List refreshes only happen on matching domain events,
 * polling-mode `shop.changed`, or explicit page-open refresh when enabled.
 */
export function useRealtimeRefresh(
  types: ShopEventType[],
  refresh: () => void,
  opts?: { refreshOnPageOpen?: boolean },
) {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const typesRef = useRef(types);
  typesRef.current = types;
  const refreshOnPageOpen = opts?.refreshOnPageOpen !== false;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastRunAt = 0;

    const run = () => {
      timer = null;
      lastRunAt = Date.now();
      safeRefresh(() => refreshRef.current());
    };

    /** Bursts of events (several saves, multiple tabs) collapse into one fetch. */
    const schedule = (delayMs: number) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, delayMs);
    };

    const onShopEvent = (e: Event) => {
      if (typeof document !== "undefined" && document.hidden) return;
      const event = (e as CustomEvent<ShopEvent>).detail;
      if (!event) return;
      if (event.type === "shop.changed" || typesRef.current.includes(event.type)) {
        schedule(600 + Math.floor(Math.random() * 300));
      }
    };

    const onPageOpen = () => {
      if (!refreshOnPageOpen) return;
      if (typeof document !== "undefined" && document.hidden) return;
      if (Date.now() - lastRunAt < 2_000) return;
      schedule(0);
    };

    window.addEventListener("shop-realtime", onShopEvent);
    window.addEventListener(PAGE_OPEN_REFRESH_EVENT, onPageOpen);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("shop-realtime", onShopEvent);
      window.removeEventListener(PAGE_OPEN_REFRESH_EVENT, onPageOpen);
    };
  }, [refreshOnPageOpen]);
}
