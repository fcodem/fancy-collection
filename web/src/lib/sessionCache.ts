/**
 * Bounded active-session cache for read-only API auth.
 * Keys use a SHA-256 hash of the session ID — never the raw ID.
 * Never expose cache keys to the browser.
 */
import { createHash } from "crypto";

export type CachedSessionIdentity = {
  id: number;
  username: string;
  role: string;
  staffId: number | null;
  staff: null;
  /** User account still active when cached. */
  active: true;
};

type CacheEntry = {
  value: CachedSessionIdentity | null;
  expiresAt: number;
};

export type SessionCacheStatus = "hit" | "miss" | "coalesced";

export type SessionValidationResult = {
  value: CachedSessionIdentity | null;
  status: SessionCacheStatus;
  cacheLookupMs: number;
  sessionDbMs: number;
};

const DEFAULT_TTL_MS = 20_000;
const MAX_ENTRIES = 2_000;

const store = new Map<string, CacheEntry>();
/** Coalesce concurrent validations for the same hashed session. */
const pending = new Map<
  string,
  {
    promise: Promise<CachedSessionIdentity | null>;
    userId?: number;
    generation: number;
  }
>();
/** Prevent an invalidated in-flight lookup from repopulating stale access. */
const generations = new Map<string, number>();

export function hashSessionId(sessionId: string): string {
  return createHash("sha256").update(sessionId).digest("hex");
}

function pruneExpired(now: number) {
  if (store.size < MAX_ENTRIES) return;
  for (const [key, entry] of store) {
    if (entry.expiresAt <= now) store.delete(key);
    if (store.size < MAX_ENTRIES * 0.8) break;
  }
  // Hard cap: drop oldest insertion-order keys
  while (store.size >= MAX_ENTRIES) {
    const first = store.keys().next().value;
    if (first === undefined) break;
    store.delete(first);
  }
}

export function getCachedSession(sessionId: string): CachedSessionIdentity | null | undefined {
  const key = hashSessionId(sessionId);
  const entry = store.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

export function setCachedSession(
  sessionId: string,
  value: CachedSessionIdentity | null,
  ttlMs = DEFAULT_TTL_MS,
) {
  const now = Date.now();
  pruneExpired(now);
  store.set(hashSessionId(sessionId), { value, expiresAt: now + ttlMs });
}

export function invalidateCachedSession(sessionId: string) {
  const key = hashSessionId(sessionId);
  store.delete(key);
  pending.delete(key);
  generations.set(key, (generations.get(key) ?? 0) + 1);
}

/** Invalidate every cached entry for a user (role/password/deactivation). */
export function invalidateCachedSessionsForUser(userId: number) {
  for (const [key, entry] of store) {
    if (entry.value?.id === userId) {
      store.delete(key);
      generations.set(key, (generations.get(key) ?? 0) + 1);
    }
  }
  for (const [key, entry] of pending) {
    if (entry.userId === userId) {
      pending.delete(key);
      generations.set(key, (generations.get(key) ?? 0) + 1);
    }
  }
}

export function clearSessionCache() {
  store.clear();
  pending.clear();
  generations.clear();
}

/**
 * Validate a read-only session through the bounded cache and return safe timing
 * metadata. `loader` runs at most once per in-flight window for that key.
 */
export async function validateSessionWithCache(
  sessionId: string,
  loader: () => Promise<CachedSessionIdentity | null>,
  userId?: number,
): Promise<SessionValidationResult> {
  const key = hashSessionId(sessionId);
  const lookupStarted = performance.now();
  const hit = getCachedSession(sessionId);
  const cacheLookupMs = performance.now() - lookupStarted;
  if (hit !== undefined) {
    return { value: hit, status: "hit", cacheLookupMs, sessionDbMs: 0 };
  }

  const existing = pending.get(key);
  if (existing) {
    const waitStarted = performance.now();
    const value = await existing.promise;
    return {
      value,
      status: "coalesced",
      cacheLookupMs,
      sessionDbMs: performance.now() - waitStarted,
    };
  }

  const generation = generations.get(key) ?? 0;
  const dbStarted = performance.now();
  const run = loader()
    .then((value) => {
      // Logout/force-logout/deactivation may have invalidated this lookup while
      // it was in flight. Never let its stale result restore cached access.
      if ((generations.get(key) ?? 0) === generation) {
        setCachedSession(sessionId, value);
      }
      return value;
    })
    .finally(() => {
      if (pending.get(key)?.promise === run) pending.delete(key);
    });

  pending.set(key, { promise: run, userId, generation });
  const value = await run;
  return {
    value,
    status: "miss",
    cacheLookupMs,
    sessionDbMs: performance.now() - dbStarted,
  };
}

/** Backwards-compatible value-only wrapper used by existing callers/tests. */
export async function coalesceSessionValidation(
  sessionId: string,
  loader: () => Promise<CachedSessionIdentity | null>,
): Promise<CachedSessionIdentity | null> {
  return (await validateSessionWithCache(sessionId, loader)).value;
}

/** Test helper */
export function sessionCacheStats() {
  return { size: store.size, pending: pending.size };
}
