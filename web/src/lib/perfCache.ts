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
/** In-flight miss sharing — concurrent callers await the same promise. */
const memoryPending = new Map<string, Promise<unknown>>();

/**
 * In-process TTL cache for payloads that exceed Next.js unstable_cache 2MB limit
 * or when tag-based invalidation is not required.
 * Concurrent cache misses share one pending promise (rejected results are not cached).
 */
export function memoryCachedQuery<T>(
  key: string[],
  fn: () => Promise<T>,
  ttlSeconds = 60,
  opts?: { staleOnError?: boolean },
): Promise<T> {
  const cacheKey = key.join(":");
  const now = Date.now();
  const hit = memoryStore.get(cacheKey) as MemoryEntry<T> | undefined;
  if (hit && hit.expiresAt > now) {
    return Promise.resolve(hit.value);
  }

  const pending = memoryPending.get(cacheKey) as Promise<T> | undefined;
  if (pending) return pending;

  const staleFallback = opts?.staleOnError ? hit?.value : undefined;

  const run = fn()
    .then((value) => {
      memoryStore.set(cacheKey, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
      return value;
    })
    .catch((error) => {
      if (staleFallback !== undefined) return staleFallback;
      throw error;
    })
    .finally(() => {
      memoryPending.delete(cacheKey);
    });

  memoryPending.set(cacheKey, run);
  return run;
}

/** Test helper — clears memory cache + pending map. */
export function clearMemoryCache() {
  memoryStore.clear();
  memoryPending.clear();
}
