import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertSamePayloadOrThrow,
  buildWhatsAppIdempotencyKey,
  hashRequestPayload,
} from "./mutationIdempotency";

describe("mutationIdempotency", () => {
  it("hashes payloads stably regardless of key order", () => {
    const a = hashRequestPayload({ b: 2, a: 1 });
    const b = hashRequestPayload({ a: 1, b: 2 });
    assert.equal(a, b);
  });

  it("rejects different payloads for same operation", () => {
    const h = hashRequestPayload({ x: 1 });
    assert.throws(() => assertSamePayloadOrThrow(h, { x: 2 }), /different payload/);
    assert.doesNotThrow(() => assertSamePayloadOrThrow(h, { x: 1 }));
  });

  it("builds deterministic WhatsApp idempotency keys", () => {
    assert.equal(
      buildWhatsAppIdempotencyKey("delivery_slip", 9, [3, 1]),
      "delivery_slip:9:1,3:v1",
    );
  });
});
