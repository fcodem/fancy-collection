"use client";

import { useShopRealtime } from "@/hooks/useShopRealtime";
import type { ShopEventType } from "@/lib/realtime/types";

/** Re-fetch data when another staff member changes shop records. */
export function useRealtimeRefresh(types: ShopEventType[], refresh: () => void) {
  useShopRealtime(types, () => refresh());
}
