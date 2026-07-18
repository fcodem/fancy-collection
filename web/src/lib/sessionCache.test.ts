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
});
