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

const DEFAULT_TTL_MS = 20_000;
const MAX_ENTRIES = 2_000;

const store = new Map<string, CacheEntry>();
/** Coalesce concurrent validations for the same hashed session. */
const pending = new Map<string, Promise<CachedSessionIdentity | null>>();

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
  store.delete(hashSessionId(sessionId));
  pending.delete(hashSessionId(sessionId));
}

/** Invalidate every cached entry for a user (role/password/deactivation). */
export function invalidateCachedSessionsForUser(userId: number) {
  for (const [key, entry] of store) {
    if (entry.value?.id === userId) {
      store.delete(key);
    }
  }
  // Pending promises may still resolve; callers should re-check DB on miss.
}

export function clearSessionCache() {
  store.clear();
  pending.clear();
}

/**
 * Coalesce simultaneous session validations for one session ID.
 * `loader` runs at most once per in-flight window for that key.
 */
export async function coalesceSessionValidation(
  sessionId: string,
  loader: () => Promise<CachedSessionIdentity | null>,
): Promise<CachedSessionIdentity | null> {
  const key = hashSessionId(sessionId);
  const hit = getCachedSession(sessionId);
  if (hit !== undefined) return hit;

  const existing = pending.get(key);
  if (existing) return existing;

  const run = loader()
    .then((value) => {
      setCachedSession(sessionId, value);
      return value;
    })
    .finally(() => {
      pending.delete(key);
    });

  pending.set(key, run);
  return run;
}

/** Test helper */
export function sessionCacheStats() {
  return { size: store.size, pending: pending.size };
}
