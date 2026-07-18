import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Deterministic secret so signature verification is stable in tests.
process.env.QR_SIGNING_SECRET = "test-qr-secret-please-change-32chars!";

import { signBookingQrToken } from "@/lib/bookingQr";
import {
  normalizeQrTarget,
  qrTargetPath,
  qrTargetPrefetchFamily,
} from "@/lib/bookingQrClient";
import {
  resolveBookingQr,
  clearQrResolveCache,
  type QrBookingFinder,
} from "./qrResolve";

const TOKEN = "11111111-1111-4111-8111-111111111111";

function finderFor(bookingId: number | null) {
  let calls = 0;
  const find: QrBookingFinder = async () => {
    calls += 1;
    return bookingId == null ? null : { bookingId };
  };
  return { find, calls: () => calls };
}

describe("qr target helpers", () => {
  it("normalizes unknown targets to booking", () => {
    assert.equal(normalizeQrTarget(null), "booking");
    assert.equal(normalizeQrTarget("JEWELLERY"), "jewellery");
    assert.equal(normalizeQrTarget("hax"), "booking");
  });

  it("maps each target to its record path", () => {
    assert.equal(qrTargetPath("booking", 5), "/booking/5");
    assert.equal(qrTargetPath("jewellery", 5), "/jewellery-selection/5");
    assert.equal(qrTargetPath("delivery", 5), "/booking-delivery/5");
    assert.equal(qrTargetPath("return", 5), "/return/5");
  });

  it("prefetch family is the list route, not a record", () => {
    assert.equal(qrTargetPrefetchFamily("jewellery"), "/jewellery-selection");
    assert.equal(qrTargetPrefetchFamily("booking"), "/booking");
  });
});

describe("resolveBookingQr", () => {
  beforeEach(() => clearQrResolveCache());

  it("rejects an invalid signature WITHOUT any booking query", async () => {
    const f = finderFor(42);
    const { outcome } = await resolveBookingQr(
      { token: TOKEN, signature: "not-a-valid-signature", target: "booking" },
      { findBooking: f.find },
    );
    assert.equal(outcome.ok, false);
    if (!outcome.ok) assert.equal(outcome.reason, "invalid_signature");
    assert.equal(f.calls(), 0, "no DB lookup on invalid signature");
  });

  it("resolves a valid signed booking to /booking/:id", async () => {
    const f = finderFor(42);
    const sig = signBookingQrToken(TOKEN);
    const { outcome } = await resolveBookingQr(
      { token: TOKEN, signature: sig, target: "booking" },
      { findBooking: f.find },
    );
    assert.equal(outcome.ok, true);
    if (outcome.ok) {
      assert.equal(outcome.bookingId, 42);
      assert.equal(outcome.url, "/booking/42");
    }
    assert.equal(f.calls(), 1);
  });

  it("honours the jewellery target", async () => {
    const f = finderFor(7);
    const sig = signBookingQrToken(TOKEN);
    const { outcome } = await resolveBookingQr(
      { token: TOKEN, signature: sig, target: "jewellery" },
      { findBooking: f.find },
    );
    assert.equal(outcome.ok && outcome.url, "/jewellery-selection/7");
  });

  it("honours delivery and return targets", async () => {
    const sig = signBookingQrToken(TOKEN);
    const d = await resolveBookingQr(
      { token: TOKEN, signature: sig, target: "delivery" },
      { findBooking: finderFor(9).find },
    );
    assert.equal(d.outcome.ok && d.outcome.url, "/booking-delivery/9");
    clearQrResolveCache();
    const r = await resolveBookingQr(
      { token: TOKEN, signature: sig, target: "return" },
      { findBooking: finderFor(9).find },
    );
    assert.equal(r.outcome.ok && r.outcome.url, "/return/9");
  });

  it("returns not_found for a missing token (no write, no token assignment)", async () => {
    const f = finderFor(null);
    const sig = signBookingQrToken(TOKEN);
    const { outcome } = await resolveBookingQr(
      { token: TOKEN, signature: sig, target: "booking" },
      { findBooking: f.find },
    );
    assert.equal(outcome.ok, false);
    if (!outcome.ok) assert.equal(outcome.reason, "not_found");
    assert.equal(f.calls(), 1);
  });

  it("trusts signatureVerified short-circuit (printed-URL page path)", async () => {
    const f = finderFor(3);
    const { outcome } = await resolveBookingQr(
      { token: TOKEN, signatureVerified: true, target: "booking" },
      { findBooking: f.find },
    );
    assert.equal(outcome.ok, true);
    if (outcome.ok) assert.equal(outcome.url, "/booking/3");
  });

  it("serves a repeat scan from the short-lived cache (one DB call for two resolves)", async () => {
    const f = finderFor(55);
    const sig = signBookingQrToken(TOKEN);
    const first = await resolveBookingQr(
      { token: TOKEN, signature: sig },
      { findBooking: f.find },
    );
    const second = await resolveBookingQr(
      { token: TOKEN, signature: sig },
      { findBooking: f.find },
    );
    assert.equal(first.outcome.ok && first.outcome.cacheStatus, "miss");
    assert.equal(second.outcome.ok && second.outcome.cacheStatus, "hit");
    assert.equal(f.calls(), 1, "second resolve hits cache, not DB");
  });

  it("coalesces simultaneous identical resolves into one DB call", async () => {
    let resolveInner: (v: { bookingId: number } | null) => void = () => {};
    const gate = new Promise<{ bookingId: number } | null>((res) => {
      resolveInner = res;
    });
    let calls = 0;
    const find: QrBookingFinder = async () => {
      calls += 1;
      return gate;
    };
    const sig = signBookingQrToken(TOKEN);
    const p1 = resolveBookingQr({ token: TOKEN, signature: sig }, { findBooking: find });
    const p2 = resolveBookingQr({ token: TOKEN, signature: sig }, { findBooking: find });
    resolveInner({ bookingId: 88 });
    const [a, b] = await Promise.all([p1, p2]);
    assert.equal(a.outcome.ok && a.outcome.bookingId, 88);
    assert.equal(b.outcome.ok && b.outcome.bookingId, 88);
    assert.equal(calls, 1, "in-flight coalescing prevents a duplicate DB call");
  });
});
