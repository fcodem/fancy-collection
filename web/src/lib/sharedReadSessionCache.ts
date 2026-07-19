import { revalidateTag, unstable_cache } from "next/cache";
import { hashSessionId } from "@/lib/sessionCache";

const SHARED_TTL_SECONDS = 15;
const SHARED_KEY_PREFIX = "read-session-v1";
const ALL_SESSIONS_TAG = "read-sessions";

export type SharedSessionValidation = {
  sessionHash: string;
  active: boolean;
  userId: number;
  role: string;
  revision: number;
  expiresAt: string;
};

export type SharedSessionCacheStatus =
  | "shared-hit"
  | "shared-miss"
  | "shared-bypass"
  | "shared-error";

export type SharedSessionCacheResult = {
  value: SharedSessionValidation | null;
  status: SharedSessionCacheStatus;
  sharedCacheMs: number;
  sessionDbMs: number;
};

export type SharedSessionCacheAdapter = {
  getOrLoad(
    key: string,
    tags: string[],
    ttlSeconds: number,
    loader: () => Promise<SharedSessionValidation>,
  ): Promise<{ value: SharedSessionValidation; loaded: boolean }>;
  invalidateTags(tags: string[]): Promise<void>;
};

function sessionTag(sessionHash: string) {
  return `read-session:${sessionHash}`;
}

function userTag(userId: number) {
  return `read-session-user:${userId}`;
}

const nextDataCacheAdapter: SharedSessionCacheAdapter = {
  async getOrLoad(key, tags, ttlSeconds, loader) {
    let loaded = false;
    const value = await unstable_cache(
      async () => {
        loaded = true;
        return loader();
      },
      [SHARED_KEY_PREFIX, key],
      { revalidate: ttlSeconds, tags },
    )();
    return { value, loaded };
  },
  async invalidateTags(tags) {
    for (const tag of tags) revalidateTag(tag);
  },
};

let adapter: SharedSessionCacheAdapter = nextDataCacheAdapter;

function sharedCacheEnabled() {
  return process.env.SHARED_READ_SESSION_CACHE_DISABLED !== "1";
}

function validPayload(
  value: SharedSessionValidation,
  expected: { sessionHash: string; userId: number; revision: number },
) {
  return (
    value.sessionHash === expected.sessionHash &&
    value.userId === expected.userId &&
    value.revision === expected.revision &&
    Number.isFinite(Date.parse(value.expiresAt)) &&
    Date.parse(value.expiresAt) > Date.now()
  );
}

/**
 * Cross-function read validation using the existing Next/Vercel Data Cache.
 * Any cache failure falls back to the authoritative loader and is never treated
 * as proof that a session is active.
 */
export async function validateSessionWithSharedCache(
  input: {
    sessionId: string;
    userId: number;
    revision: number;
  },
  authoritativeLoader: () => Promise<SharedSessionValidation>,
): Promise<SharedSessionCacheResult> {
  const started = performance.now();
  let sessionDbMs = 0;
  const sessionHash = hashSessionId(input.sessionId);

  const loadFromDatabase = async () => {
    const dbStarted = performance.now();
    try {
      return await authoritativeLoader();
    } finally {
      sessionDbMs += performance.now() - dbStarted;
    }
  };

  if (!sharedCacheEnabled()) {
    return {
      value: await loadFromDatabase(),
      status: "shared-bypass",
      sharedCacheMs: 0,
      sessionDbMs,
    };
  }

  try {
    const result = await adapter.getOrLoad(
      `${sessionHash}:${input.revision}`,
      [ALL_SESSIONS_TAG, sessionTag(sessionHash), userTag(input.userId)],
      SHARED_TTL_SECONDS,
      loadFromDatabase,
    );
    if (!validPayload(result.value, { ...input, sessionHash })) {
      return {
        value: await loadFromDatabase(),
        status: "shared-error",
        sharedCacheMs: performance.now() - started - sessionDbMs,
        sessionDbMs,
      };
    }
    return {
      value: result.value,
      status: result.loaded ? "shared-miss" : "shared-hit",
      sharedCacheMs: performance.now() - started - sessionDbMs,
      sessionDbMs,
    };
  } catch {
    const value = await loadFromDatabase();
    return {
      value,
      status: "shared-error",
      sharedCacheMs: performance.now() - started - sessionDbMs,
      sessionDbMs,
    };
  }
}

export async function invalidateSharedSession(sessionId: string) {
  if (!sharedCacheEnabled()) return;
  await adapter.invalidateTags([sessionTag(hashSessionId(sessionId))]);
}

export async function invalidateSharedSessionsForUser(userId: number) {
  if (!sharedCacheEnabled()) return;
  await adapter.invalidateTags([userTag(userId)]);
}

export async function invalidateAllSharedSessions() {
  if (!sharedCacheEnabled()) return;
  await adapter.invalidateTags([ALL_SESSIONS_TAG]);
}

/** Test-only adapter seam; never carries over between serverless instances. */
export function setSharedSessionCacheAdapterForTests(
  replacement: SharedSessionCacheAdapter | null,
) {
  adapter = replacement ?? nextDataCacheAdapter;
}
