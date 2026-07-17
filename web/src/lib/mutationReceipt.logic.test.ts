import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertSamePayloadOrThrow,
  buildWhatsAppIdempotencyKey,
  hashRequestPayload,
} from "./mutationIdempotency";

describe("mutation idempotency contracts", () => {
  it("same payload hashes equal; different payload mismatches", () => {
    const a = hashRequestPayload({ items: [2, 1], action: "deliver" });
    const b = hashRequestPayload({ action: "deliver", items: [2, 1] });
    assert.equal(a, b);
    assert.throws(
      () => assertSamePayloadOrThrow(a, { action: "deliver", items: [1] }),
      /different payload/,
    );
  });

  it("WhatsApp keys ignore item id order but differ by scope/version", () => {
    const k1 = buildWhatsAppIdempotencyKey("delivery_slip", 10, [5, 2], "combined");
    const k2 = buildWhatsAppIdempotencyKey("delivery_slip", 10, [2, 5], "combined");
    const k3 = buildWhatsAppIdempotencyKey("delivery_slip", 10, [2, 5], "single");
    assert.equal(k1, k2);
    assert.notEqual(k1, k3);
  });
});
