"use client";

import { useCallback, useRef } from "react";

type CacheEntry<T> = { value: T; expiresAt: number };

/**
 * Bounded LRU-ish client cache for list/search responses (30–60s TTL).
 */
export function useBoundedQueryCache<T>(opts?: { maxEntries?: number; ttlMs?: number }) {
  const maxEntries = opts?.maxEntries ?? 24;
  const ttlMs = opts?.ttlMs ?? 45_000;
  const mapRef = useRef<Map<string, CacheEntry<T>>>(new Map());

  const get = useCallback(
    (key: string): T | undefined => {
      const entry = mapRef.current.get(key);
      if (!entry) return undefined;
      if (Date.now() > entry.expiresAt) {
        mapRef.current.delete(key);
        return undefined;
      }
      // refresh LRU order
      mapRef.current.delete(key);
      mapRef.current.set(key, entry);
      return entry.value;
    },
    [],
  );

  const set = useCallback(
    (key: string, value: T) => {
      if (mapRef.current.has(key)) mapRef.current.delete(key);
      mapRef.current.set(key, { value, expiresAt: Date.now() + ttlMs });
      while (mapRef.current.size > maxEntries) {
        const oldest = mapRef.current.keys().next().value;
        if (oldest !== undefined) mapRef.current.delete(oldest);
        else break;
      }
    },
    [maxEntries, ttlMs],
  );

  const invalidatePrefix = useCallback((prefix: string) => {
    for (const key of Array.from(mapRef.current.keys())) {
      if (key.startsWith(prefix)) mapRef.current.delete(key);
    }
  }, []);

  const clear = useCallback(() => {
    mapRef.current.clear();
  }, []);

  return { get, set, invalidatePrefix, clear };
}
