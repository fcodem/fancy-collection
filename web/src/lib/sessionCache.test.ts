import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  clearSessionCache,
  coalesceSessionValidation,
  getCachedSession,
  hashSessionId,
  invalidateCachedSession,
  invalidateCachedSessionsForUser,
  setCachedSession,
  sessionCacheStats,
  validateSessionWithCache,
  type CachedSessionIdentity,
} from "./sessionCache";

function ident(id: number, username = `u${id}`): CachedSessionIdentity {
  return { id, username, role: "staff", staffId: id, staff: null, active: true };
}

describe("sessionCache", () => {
  beforeEach(() => clearSessionCache());

  it("hashes session ids (never stores raw key as lookup value)", () => {
    const a = hashSessionId("abc");
    const b = hashSessionId("abc");
    const c = hashSessionId("abd");
    assert.equal(a, b);
    assert.notEqual(a, c);
    assert.equal(a.length, 64);
  });

  it("returns undefined on miss and value on hit", () => {
    assert.equal(getCachedSession("s1"), undefined);
    setCachedSession("s1", ident(1));
    assert.deepEqual(getCachedSession("s1"), ident(1));
  });

  it("stores null for inactive sessions so callers skip DB briefly", () => {
    setCachedSession("dead", null);
    assert.equal(getCachedSession("dead"), null);
  });

  it("invalidateCachedSession removes one session", () => {
    setCachedSession("s1", ident(1));
    setCachedSession("s2", ident(2));
    invalidateCachedSession("s1");
    assert.equal(getCachedSession("s1"), undefined);
    assert.deepEqual(getCachedSession("s2"), ident(2));
  });

  it("invalidateCachedSessionsForUser removes all entries for that user", () => {
    setCachedSession("a", ident(10, "alice"));
    setCachedSession("b", ident(10, "alice"));
    setCachedSession("c", ident(11, "bob"));
    invalidateCachedSessionsForUser(10);
    assert.equal(getCachedSession("a"), undefined);
    assert.equal(getCachedSession("b"), undefined);
    assert.deepEqual(getCachedSession("c"), ident(11, "bob"));
  });

  it("coalesces simultaneous validations into one loader call", async () => {
    let calls = 0;
    const loaders = Array.from({ length: 5 }, () =>
      coalesceSessionValidation("same-sid", async () => {
        calls += 1;
        await new Promise((r) => setTimeout(r, 20));
        return ident(5);
      }),
    );
    const results = await Promise.all(loaders);
    assert.equal(calls, 1);
    for (const r of results) assert.deepEqual(r, ident(5));
    assert.equal(sessionCacheStats().pending, 0);
  });

  it("user A cache cannot be read via user B session id", () => {
    setCachedSession("session-a", ident(1, "alice"));
    assert.equal(getCachedSession("session-b"), undefined);
    setCachedSession("session-b", ident(2, "bob"));
    assert.equal(getCachedSession("session-a")?.username, "alice");
    assert.equal(getCachedSession("session-b")?.username, "bob");
  });

  it("reports miss then hit and avoids the second validation query", async () => {
    let calls = 0;
    const load = async () => {
      calls += 1;
      return ident(7);
    };
    const first = await validateSessionWithCache("sid-7", load, 7);
    const second = await validateSessionWithCache("sid-7", load, 7);
    assert.equal(first.status, "miss");
    assert.equal(second.status, "hit");
    assert.equal(second.sessionDbMs, 0);
    assert.equal(calls, 1);
  });

  it("rejects an invalid session and caches the negative result briefly", async () => {
    let calls = 0;
    const load = async () => {
      calls += 1;
      return null;
    };
    assert.equal((await validateSessionWithCache("dead", load, 9)).value, null);
    assert.equal((await validateSessionWithCache("dead", load, 9)).value, null);
    assert.equal(calls, 1);
  });

  it("force logout invalidation removes cached access immediately", async () => {
    await validateSessionWithCache("force-out", async () => ident(12), 12);
    invalidateCachedSession("force-out");
    const after = await validateSessionWithCache("force-out", async () => null, 12);
    assert.equal(after.value, null);
    assert.equal(after.status, "miss");
  });

  it("deactivation/role invalidation replaces stale identity", async () => {
    await validateSessionWithCache("role", async () => ident(13), 13);
    invalidateCachedSessionsForUser(13);
    const owner = { ...ident(13), role: "owner" };
    const after = await validateSessionWithCache("role", async () => owner, 13);
    assert.equal(after.value?.role, "owner");
    assert.equal(after.status, "miss");
  });

  it("invalidation during an in-flight read cannot repopulate stale access", async () => {
    let release!: (value: CachedSessionIdentity | null) => void;
    const gate = new Promise<CachedSessionIdentity | null>((resolve) => {
      release = resolve;
    });
    const pendingRead = validateSessionWithCache("racing", () => gate, 21);
    invalidateCachedSessionsForUser(21);
    release(ident(21));
    await pendingRead;
    assert.equal(getCachedSession("racing"), undefined);
  });
});
