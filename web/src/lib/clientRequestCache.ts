/**
 * Browser-side in-flight dedupe + short TTL cache for booking form GETs.
 * Never use as booking authority — server transaction remains final.
 */

type CacheEntry<T> = { expires: number; value: Promise<T> };

const inflight = new Map<string, Promise<unknown>>();
const cache = new Map<string, CacheEntry<unknown>>();

export function yearMonthKey(isoDate: string): string {
  return isoDate.slice(0, 7); // YYYY-MM
}

export async function cachedFetchJson<T>(
  key: string,
  fetcher: (signal: AbortSignal) => Promise<T>,
  opts?: { ttlMs?: number; signal?: AbortSignal },
): Promise<T> {
  const ttlMs = opts?.ttlMs ?? 20_000;
  const now = Date.now();
  const hit = cache.get(key) as CacheEntry<T> | undefined;
  if (hit && hit.expires > now) {
    return hit.value;
  }

  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) {
    return existing;
  }

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  opts?.signal?.addEventListener("abort", onAbort, { once: true });

  const promise = (async () => {
    try {
      return await fetcher(controller.signal);
    } finally {
      inflight.delete(key);
      opts?.signal?.removeEventListener("abort", onAbort);
    }
  })();

  inflight.set(key, promise);
  cache.set(key, { expires: now + ttlMs, value: promise });

  try {
    return await promise;
  } catch (e) {
    // Do not poison cache with failures
    cache.delete(key);
    throw e;
  }
}

export function invalidateClientCache(prefix?: string) {
  if (!prefix) {
    cache.clear();
    inflight.clear();
    return;
  }
  for (const k of [...cache.keys()]) {
    if (k.startsWith(prefix)) cache.delete(k);
  }
  for (const k of [...inflight.keys()]) {
    if (k.startsWith(prefix)) inflight.delete(k);
  }
}
