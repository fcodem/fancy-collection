import { unstable_cache } from "next/cache";

/** Short-lived server cache for read-heavy list/aggregate endpoints (30–60s). */
export function cachedQuery<T>(
  key: string[],
  fn: () => Promise<T>,
  revalidateSeconds = 30,
): Promise<T> {
  return unstable_cache(fn, key, { revalidate: revalidateSeconds, tags: [key[0]] })();
}

type MemoryEntry<T> = { value: T; expiresAt: number };

const memoryStore = new Map<string, MemoryEntry<unknown>>();

/**
 * In-process TTL cache for payloads that exceed Next.js unstable_cache 2MB limit
 * or when tag-based invalidation is not required.
 */
export function memoryCachedQuery<T>(
  key: string[],
  fn: () => Promise<T>,
  ttlSeconds = 60,
): Promise<T> {
  const cacheKey = key.join(":");
  const now = Date.now();
  const hit = memoryStore.get(cacheKey) as MemoryEntry<T> | undefined;
  if (hit && hit.expiresAt > now) {
    return Promise.resolve(hit.value);
  }
  return fn().then((value) => {
    memoryStore.set(cacheKey, { value, expiresAt: now + ttlSeconds * 1000 });
    return value;
  });
}
