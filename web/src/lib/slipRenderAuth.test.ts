import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

process.env.PDF_RENDER_SECRET = "test-render-secret-value";

type AuthModule = typeof import("./slipRenderAuth");
let mod: AuthModule;

before(async () => {
  mod = await import("./slipRenderAuth");
});

function headersToVerifyInput(headers: Record<string, string>, rawBody: string) {
  return {
    ts: headers[mod.SLIP_TS_HEADER] ?? null,
    nonce: headers[mod.SLIP_NONCE_HEADER] ?? null,
    sig: headers[mod.SLIP_SIG_HEADER] ?? null,
    bodyHash: headers[mod.SLIP_BODYHASH_HEADER] ?? null,
    rawBody,
  };
}

describe("slip render auth", () => {
  it("accepts a freshly signed request", () => {
    mod.__resetSlipRenderNonces();
    const raw = JSON.stringify({ kind: "booking", bookingId: 12 });
    const headers = mod.buildSlipRenderAuthHeaders(raw);
    const result = mod.verifySlipRenderAuth(headersToVerifyInput(headers, raw));
    assert.deepEqual(result, { ok: true });
  });

  it("rejects a replayed nonce", () => {
    mod.__resetSlipRenderNonces();
    const raw = JSON.stringify({ kind: "delivery", bookingId: 5 });
    const headers = mod.buildSlipRenderAuthHeaders(raw);
    assert.deepEqual(mod.verifySlipRenderAuth(headersToVerifyInput(headers, raw)), { ok: true });
    const second = mod.verifySlipRenderAuth(headersToVerifyInput(headers, raw));
    assert.equal(second.ok, false);
    assert.equal((second as { reason: string }).reason, "replay");
  });

  it("rejects a tampered body", () => {
    mod.__resetSlipRenderNonces();
    const raw = JSON.stringify({ kind: "return", bookingId: 9 });
    const headers = mod.buildSlipRenderAuthHeaders(raw);
    const tampered = JSON.stringify({ kind: "return", bookingId: 999 });
    const result = mod.verifySlipRenderAuth(headersToVerifyInput(headers, tampered));
    assert.equal(result.ok, false);
  });

  it("rejects an expired timestamp", () => {
    mod.__resetSlipRenderNonces();
    const raw = JSON.stringify({ kind: "booking", bookingId: 1 });
    const headers = mod.buildSlipRenderAuthHeaders(raw);
    headers[mod.SLIP_TS_HEADER] = String(Date.now() - 5 * 60_000);
    const result = mod.verifySlipRenderAuth(headersToVerifyInput(headers, raw));
    assert.equal(result.ok, false);
    assert.equal((result as { reason: string }).reason, "expired");
  });

  it("rejects a bad signature without touching booking work", () => {
    mod.__resetSlipRenderNonces();
    const raw = JSON.stringify({ kind: "booking", bookingId: 3 });
    const headers = mod.buildSlipRenderAuthHeaders(raw);
    headers[mod.SLIP_SIG_HEADER] = "not-a-valid-signature";
    const result = mod.verifySlipRenderAuth(headersToVerifyInput(headers, raw));
    assert.equal(result.ok, false);
  });

  it("rejects missing headers", () => {
    mod.__resetSlipRenderNonces();
    const result = mod.verifySlipRenderAuth({
      ts: null,
      nonce: null,
      sig: null,
      bodyHash: null,
      rawBody: "{}",
    });
    assert.equal(result.ok, false);
    assert.equal((result as { reason: string }).reason, "missing_headers");
  });
});
