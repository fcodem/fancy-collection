import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  invalidateSharedSession,
  invalidateSharedSessionsForUser,
  setSharedSessionCacheAdapterForTests,
  validateSessionWithSharedCache,
  type SharedSessionCacheAdapter,
  type SharedSessionValidation,
} from "./sharedReadSessionCache";
import {
  clearSessionCache,
  getCachedSession,
  hashSessionId,
  validateSessionWithCache,
  type CachedSessionIdentity,
} from "./sessionCache";

class MemorySharedAdapter implements SharedSessionCacheAdapter {
  readonly values = new Map<string, SharedSessionValidation>();
  readonly keyTags = new Map<string, Set<string>>();
  outage = false;

  async getOrLoad(
    key: string,
    tags: string[],
    _ttlSeconds: number,
    loader: () => Promise<SharedSessionValidation>,
  ) {
    if (this.outage) throw new Error("shared cache unavailable");
    const hit = this.values.get(key);
    if (hit) return { value: hit, loaded: false };
    const value = await loader();
    this.values.set(key, value);
    this.keyTags.set(key, new Set(tags));
    return { value, loaded: true };
  }

  async invalidateTags(tags: string[]) {
    if (this.outage) throw new Error("shared cache unavailable");
    for (const [key, entryTags] of this.keyTags) {
      if (tags.some((tag) => entryTags.has(tag))) {
        this.values.delete(key);
        this.keyTags.delete(key);
      }
    }
  }
}

function sharedValue(
  sessionId: string,
  userId = 1,
  role = "staff",
  revision = 1,
  active = true,
): SharedSessionValidation {
  return {
    sessionHash: hashSessionId(sessionId),
    active,
    userId,
    role,
    revision,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
}

function identity(value: SharedSessionValidation): CachedSessionIdentity | null {
  if (!value.active) return null;
  return {
    id: value.userId,
    username: `user-${value.userId}`,
    role: value.role,
    staffId: value.userId,
    staff: null,
    sessionRevision: value.revision,
    expiresAt: value.expiresAt,
    active: true,
  };
}

describe("shared read session validation", () => {
  let adapter: MemorySharedAdapter;

  beforeEach(() => {
    adapter = new MemorySharedAdapter();
    setSharedSessionCacheAdapterForTests(adapter);
    clearSessionCache();
    delete process.env.SHARED_READ_SESSION_CACHE_DISABLED;
  });

  afterEach(() => {
    setSharedSessionCacheAdapterForTests(null);
    clearSessionCache();
  });

  it("serves a simulated second serverless instance from shared cache", async () => {
    let databaseCalls = 0;
    const validate = async () => {
      const shared = await validateSessionWithSharedCache(
        { sessionId: "cross-function", userId: 1, revision: 1 },
        async () => {
          databaseCalls += 1;
          return sharedValue("cross-function");
        },
      );
      return validateSessionWithCache(
        "cross-function",
        async () => identity(shared.value!),
        1,
      );
    };

    const first = await validate();
    assert.equal(first.status, "miss");
    clearSessionCache(); // separate function instance: no local memory
    const started = performance.now();
    const second = await validate();
    assert(performance.now() - started < 100);
    assert.equal(second.value?.id, 1);
    assert.equal(databaseCalls, 1);
  });

  it("local warm identity plus the shared gate avoids database work", async () => {
    let databaseCalls = 0;
    let sharedCalls = 0;
    const validate = async () => {
      sharedCalls += 1;
      const shared = await validateSessionWithSharedCache(
        { sessionId: "local", userId: 2, revision: 1 },
        async () => {
          databaseCalls += 1;
          return sharedValue("local", 2);
        },
      );
      return validateSessionWithCache("local", async () => identity(shared.value!), 2);
    };
    await validate();
    const started = performance.now();
    const warm = await validate();
    assert(performance.now() - started < 20);
    assert.equal(warm.status, "hit");
    assert.equal(sharedCalls, 2);
    assert.equal(databaseCalls, 1);
  });

  it("force logout invalidates the hashed session entry", async () => {
    const initial = await validateSessionWithSharedCache(
      { sessionId: "force", userId: 3, revision: 1 },
      async () => sharedValue("force", 3),
    );
    await validateSessionWithCache("force", async () => identity(initial.value!), 3);
    assert.equal(getCachedSession("force")?.active, true);

    // Simulates invalidation from another function: this process still has a
    // local entry, but the mandatory shared gate must reject it.
    await invalidateSharedSession("force");
    const after = await validateSessionWithSharedCache(
      { sessionId: "force", userId: 3, revision: 1 },
      async () => sharedValue("force", 3, "staff", 1, false),
    );
    assert.equal(after.status, "shared-miss");
    assert.equal(after.value?.active, false);
    assert.equal(getCachedSession("force")?.active, true);
  });

  it("role and deactivation invalidation remove every user entry", async () => {
    await validateSessionWithSharedCache(
      { sessionId: "role-a", userId: 4, revision: 1 },
      async () => sharedValue("role-a", 4),
    );
    await validateSessionWithSharedCache(
      { sessionId: "role-b", userId: 4, revision: 1 },
      async () => sharedValue("role-b", 4),
    );
    await invalidateSharedSessionsForUser(4);

    const role = await validateSessionWithSharedCache(
      { sessionId: "role-a", userId: 4, revision: 2 },
      async () => sharedValue("role-a", 4, "owner", 2),
    );
    const inactive = await validateSessionWithSharedCache(
      { sessionId: "role-b", userId: 4, revision: 2 },
      async () => sharedValue("role-b", 4, "owner", 2, false),
    );
    assert.equal(role.value?.role, "owner");
    assert.equal(inactive.value?.active, false);
  });

  it("keeps users isolated and never stores raw session IDs", async () => {
    await validateSessionWithSharedCache(
      { sessionId: "secret-session-a", userId: 10, revision: 1 },
      async () => sharedValue("secret-session-a", 10),
    );
    await validateSessionWithSharedCache(
      { sessionId: "secret-session-b", userId: 11, revision: 1 },
      async () => sharedValue("secret-session-b", 11),
    );
    const serialized = JSON.stringify([...adapter.values.entries()]);
    assert.doesNotMatch(serialized, /secret-session-[ab]/);
    assert.match(serialized, new RegExp(hashSessionId("secret-session-a")));
    assert.notEqual(
      adapter.values.get(`${hashSessionId("secret-session-a")}:1`)?.userId,
      adapter.values.get(`${hashSessionId("secret-session-b")}:1`)?.userId,
    );
  });

  it("shared cache outage safely falls back to authoritative loading", async () => {
    adapter.outage = true;
    let databaseCalls = 0;
    const result = await validateSessionWithSharedCache(
      { sessionId: "outage", userId: 12, revision: 1 },
      async () => {
        databaseCalls += 1;
        return sharedValue("outage", 12);
      },
    );
    assert.equal(result.status, "shared-error");
    assert.equal(result.value?.userId, 12);
    assert.equal(databaseCalls, 1);
  });

  it("mutation auth remains authoritative and required routes use fast reads", () => {
    const api = readFileSync(join(process.cwd(), "src/lib/api.ts"), "utf8");
    assert.match(api, /requireUser[\s\S]*getCurrentUser\(\)/);
    assert.doesNotMatch(
      api.slice(api.indexOf("export async function requireUser"), api.indexOf("/**", 100)),
      /getFastReadUserResult/,
    );
    for (const route of [
      "src/app/api/dress-checker/scan-availability/route.ts",
      "src/app/api/dashboard/nav-counts/route.ts",
      "src/app/api/dashboard/data/route.ts",
      "src/app/api/booking/available-items/route.ts",
      "src/app/api/booking/date-check/route.ts",
      "src/app/api/delivery/search/route.ts",
      "src/app/api/return/search/route.ts",
      "src/app/api/packing-list/route.ts",
      "src/app/api/inventory/list/route.ts",
    ]) {
      assert.match(readFileSync(join(process.cwd(), route), "utf8"), /requireFastReadUser/);
    }
  });
});
