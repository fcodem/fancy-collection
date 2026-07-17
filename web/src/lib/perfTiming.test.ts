import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createPerfTimer, toServerTimingHeader } from "./perfTiming";

describe("perfTiming", () => {
  it("records stages and builds Server-Timing", () => {
    const t = createPerfTimer("test-route");
    t.set("authMs", 12);
    t.set("transactionMs", 40);
    t.setItemCount(3);
    t.addQueries(2);
    const snap = t.finish({ kind: "mutation", forceLog: true });
    assert.equal(snap.route, "test-route");
    assert.equal(snap.authMs, 12);
    assert.equal(snap.itemCount, 3);
    assert.ok((snap.totalMs ?? 0) >= 0);
    const header = toServerTimingHeader(snap);
    assert.match(header, /auth;dur=12/);
    assert.match(header, /transaction;dur=40/);
  });
});
