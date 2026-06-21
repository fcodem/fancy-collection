import { NextRequest } from "next/server";
import { requireUserReadOnly, isResponse } from "@/lib/api";
import { getServerRealtimeMode } from "@/lib/realtime/config";
import { registerRealtimeClient, subscribeShopEvents } from "@/lib/realtime/bus";
import type { ShopEvent } from "@/lib/realtime/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const HEARTBEAT_MS = 25_000;

/**
 * Legacy SSE stream — only used when REALTIME_MODE=sse (single Node process / local dev).
 * On Vercel use NEXT_PUBLIC_REALTIME_MODE=polling or ably.
 */
export async function GET(req: NextRequest) {
  const mode = getServerRealtimeMode();

  if (mode === "polling") {
    return new Response(
      JSON.stringify({
        mode: "polling",
        message: "Realtime uses client polling. Set REALTIME_MODE=sse for EventSource.",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  if (mode === "ably") {
    return new Response(
      JSON.stringify({
        mode: "ably",
        message: "Realtime uses Ably WebSocket. SSE is disabled.",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  const user = await requireUserReadOnly();
  if (isResponse(user)) return user;

  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: ShopEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          cleanup?.();
        }
      };

      const unsubscribe = subscribeShopEvents(send);
      const unregister = registerRealtimeClient(user.username);

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          cleanup?.();
        }
      }, HEARTBEAT_MS);

      cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
        unregister();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      req.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
