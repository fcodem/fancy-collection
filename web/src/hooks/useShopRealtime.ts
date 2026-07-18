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

async function fetchShopRevision(signal?: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch("/api/realtime/revision", {
      credentials: "same-origin",
      cache: "no-store",
      signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { rev?: unknown };
    return typeof data.rev === "string" ? data.rev : null;
  } catch {
    return null;
  }
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
      // Only emit when the shop revision changes. Fabricating nav.refresh every
      // interval previously forced every open list (and the dashboard) to refetch
      // even when nothing changed — burning the 3-connection Prisma pool.
      let lastRev: string | null = null;
      let inFlight = false;

      const tick = async () => {
        if (closed || inFlight) return;
        if (typeof document !== "undefined" && document.hidden) return;
        inFlight = true;
        try {
          const rev = await fetchShopRevision();
          if (closed || rev == null) return;
          if (lastRev === null) {
            lastRev = rev;
            return;
          }
          if (rev === lastRev) return;
          lastRev = rev;
          const event: ShopEvent = { type: "shop.changed", at: new Date().toISOString() };
          if (shouldDeliver(typesRef.current, event)) {
            onEventRef.current(event);
          }
        } finally {
          inFlight = false;
        }
      };

      void tick();
      const id = setInterval(() => {
        void tick();
      }, POLL_INTERVAL_MS);
      const onVisibility = () => {
        if (!document.hidden) void tick();
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
      let lastRev: string | null = null;
      let fallbackInFlight = false;

      const revisionFallbackTick = async () => {
        if (closed || fallbackInFlight) return;
        if (typeof document !== "undefined" && document.hidden) return;
        fallbackInFlight = true;
        try {
          const rev = await fetchShopRevision();
          if (closed || rev == null) return;
          if (lastRev === null) {
            lastRev = rev;
            return;
          }
          if (rev === lastRev) return;
          lastRev = rev;
          onEventRef.current({ type: "shop.changed", at: new Date().toISOString() });
        } finally {
          fallbackInFlight = false;
        }
      };

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
          void revisionFallbackTick();
          pollFallbackId = setInterval(() => {
            void revisionFallbackTick();
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
