import { EventEmitter } from "events";
import type { ShopEvent } from "./types";

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

export function subscribeShopEvents(listener: Listener): () => void {
  const bus = getBus();
  bus.on("shop", listener);
  return () => bus.off("shop", listener);
}

export function emitShopEvent(event: ShopEvent) {
  getBus().emit("shop", event);
}

export function registerRealtimeClient(username?: string): () => void {
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
