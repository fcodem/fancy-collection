"use client";

import { useEffect, useRef } from "react";
import type { ShopEvent, ShopEventType } from "@/lib/realtime/types";
import { getClientRealtimeMode, POLL_INTERVAL_MS } from "@/lib/realtime/config";

const RECONNECT_MS = 3_000;
const ABLY_CHANNEL = "shop";
const ABLY_EVENT = "event";

function shouldDeliver(allowed: ShopEventType[] | "all", event: ShopEvent): boolean {
  return allowed === "all" || allowed.includes(event.type);
}

/** Subscribe to shop-wide updates: polling (Vercel), Ably pub/sub, or legacy SSE (single Node process). */
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

    const mode = getClientRealtimeMode();
    let closed = false;

  if (mode === "polling") {
      const tick = () => {
        if (closed || (typeof document !== "undefined" && document.hidden)) return;
        const event: ShopEvent = { type: "nav.refresh", at: new Date().toISOString() };
        if (shouldDeliver(typesRef.current, event)) {
          onEventRef.current(event);
        }
      };

      const id = setInterval(tick, POLL_INTERVAL_MS);
      const onVisibility = () => {
        if (!document.hidden) tick();
      };
      document.addEventListener("visibilitychange", onVisibility);
      return () => {
        closed = true;
        clearInterval(id);
        document.removeEventListener("visibilitychange", onVisibility);
      };
    }

    if (mode === "ably") {
      let client: import("ably").Realtime | null = null;
      let channel: import("ably").RealtimeChannel | null = null;
      let pollFallbackId: ReturnType<typeof setInterval> | null = null;

      (async () => {
        try {
          const Ably = await import("ably");
          client = new Ably.Realtime({
            authUrl: "/api/ably/token",
            echoMessages: false,
          });

          channel = client.channels.get(ABLY_CHANNEL);
          channel.subscribe(ABLY_EVENT, (message) => {
            if (closed) return;
            try {
              const event = message.data as ShopEvent;
              if (shouldDeliver(typesRef.current, event)) {
                onEventRef.current(event);
              }
            } catch {
              /* ignore malformed */
            }
          });
        } catch {
          pollFallbackId = setInterval(() => {
            if (closed) return;
            onEventRef.current({ type: "nav.refresh", at: new Date().toISOString() });
          }, POLL_INTERVAL_MS);
        }
      })();

      return () => {
        closed = true;
        channel?.unsubscribe();
        client?.close();
        if (pollFallbackId) clearInterval(pollFallbackId);
      };
    }

    // Legacy SSE — only reliable on a single long-lived Node process (local dev).
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (closed) return;
      es = new EventSource("/api/realtime/events");

      es.onmessage = (msg) => {
        try {
          const event = JSON.parse(msg.data) as ShopEvent;
          if (shouldDeliver(typesRef.current, event)) {
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
