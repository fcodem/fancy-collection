import { EventEmitter } from "events";
import type { ShopEvent } from "./types";
import { getServerRealtimeMode } from "./config";

type Listener = (event: ShopEvent) => void;

const globalForBus = globalThis as unknown as {
  shopRealtimeBus?: EventEmitter;
  shopRealtimeClients?: number;
};

function getBus() {
  if (!globalForBus.shopRealtimeBus) {
    globalForBus.shopRealtimeBus = new EventEmitter();
    globalForBus.shopRealtimeBus.setMaxListeners(50);
    globalForBus.shopRealtimeClients = 0;
  }
  return globalForBus.shopRealtimeBus;
}

/** Publish to Ably (cross-instance). Used when REALTIME_MODE=ably. */
async function publishAblyEvent(event: ShopEvent): Promise<void> {
  const key = process.env.ABLY_API_KEY;
  if (!key) {
    console.warn("[realtime] ABLY_API_KEY not set; event not published");
    return;
  }
  try {
    const Ably = await import("ably");
    const rest = new Ably.Rest({ key });
    await rest.channels.get("shop").publish("event", event);
  } catch (err) {
    console.error("[realtime] Ably publish failed:", err);
  }
}

export function subscribeShopEvents(listener: Listener): () => void {
  const bus = getBus();
  bus.on("shop", listener);
  return () => bus.off("shop", listener);
}

export function emitShopEvent(event: ShopEvent) {
  const mode = getServerRealtimeMode();

  if (mode === "ably") {
    void publishAblyEvent(event);
    return;
  }

  if (mode === "sse") {
    getBus().emit("shop", event);
    return;
  }

  // polling: clients refresh on an interval — no server-side fan-out needed
}

export function registerRealtimeClient(username?: string): () => void {
  if (getServerRealtimeMode() !== "sse") {
    return () => {};
  }

  globalForBus.shopRealtimeClients = (globalForBus.shopRealtimeClients ?? 0) + 1;
  const online = globalForBus.shopRealtimeClients;
  emitShopEvent({
    type: "presence",
    online,
    by: username,
    at: new Date().toISOString(),
  });
  return () => {
    globalForBus.shopRealtimeClients = Math.max(0, (globalForBus.shopRealtimeClients ?? 1) - 1);
    emitShopEvent({
      type: "presence",
      online: globalForBus.shopRealtimeClients,
      at: new Date().toISOString(),
    });
  };
}

export function getOnlineClientCount() {
  return globalForBus.shopRealtimeClients ?? 0;
}
