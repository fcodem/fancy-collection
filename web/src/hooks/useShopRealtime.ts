"use client";

import { useEffect, useRef } from "react";
import type { ShopEvent, ShopEventType } from "@/lib/realtime/types";

const RECONNECT_MS = 3_000;

/** Subscribe to shop-wide realtime events via Server-Sent Events. */
export function useShopRealtime(
  types: ShopEventType[] | "all",
  onEvent: (event: ShopEvent) => void,
  enabled = true,
) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const typesRef = useRef(types);
  typesRef.current = types;

  useEffect(() => {
    if (!enabled) return;

    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    function connect() {
      if (closed) return;
      es = new EventSource("/api/realtime/events");

      es.onmessage = (msg) => {
        try {
          const event = JSON.parse(msg.data) as ShopEvent;
          const allowed = typesRef.current;
          if (allowed === "all" || allowed.includes(event.type)) {
            onEventRef.current(event);
          }
        } catch {
          /* ignore malformed */
        }
      };

      es.onerror = () => {
        es?.close();
        es = null;
        if (!closed) {
          reconnectTimer = setTimeout(connect, RECONNECT_MS);
        }
      };
    }

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      es?.close();
    };
  }, [enabled]);
}
