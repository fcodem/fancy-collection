/**
 * Bounded one-value cache with request coalescing and stale-on-error semantics.
 * Suitable for small, shared configuration payloads such as categories.
 */
export function createStaleValueCache<T>(
  loader: () => Promise<T>,
  opts?: {
    ttlMs?: number;
    onRefreshError?: (error: unknown) => void;
  },
) {
  const ttlMs = opts?.ttlMs ?? 10 * 60_000;
  let entry: { value: T; expiresAt: number } | null = null;
  let inflight: Promise<T> | null = null;

  async function get(): Promise<T> {
    const now = Date.now();
    if (entry && entry.expiresAt > now) return entry.value;
    if (inflight) return inflight;

    inflight = loader()
      .then((value) => {
        entry = { value, expiresAt: Date.now() + ttlMs };
        return value;
      })
      .catch((error) => {
        // Warn once for this coalesced refresh attempt, not once per caller.
        opts?.onRefreshError?.(error);
        if (entry) return entry.value;
        throw error;
      })
      .finally(() => {
        inflight = null;
      });

    return inflight;
  }

  function invalidate() {
    // Keep the last known successful value as an emergency stale fallback, but
    // mark it expired so the next category consumer attempts one refresh.
    if (entry) entry.expiresAt = 0;
  }

  function clear() {
    entry = null;
    inflight = null;
  }

  return {
    get,
    invalidate,
    clear,
    stats: () => ({
      hasValue: entry !== null,
      fresh: Boolean(entry && entry.expiresAt > Date.now()),
      inflight: inflight !== null,
    }),
  };
}
