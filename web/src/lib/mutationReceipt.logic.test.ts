import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertSamePayloadOrThrow,
  buildWhatsAppIdempotencyKey,
  hashRequestPayload,
} from "./mutationIdempotency";
import { MutationIdempotencyError, toPublicErrorPayload } from "./mutationErrors";

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

  it("return and incomplete slips use distinct keys", () => {
    const r = buildWhatsAppIdempotencyKey("return_slip", 7, [1, 2], "combined");
    const i = buildWhatsAppIdempotencyKey("incomplete_slip", 7, [1, 2], "combined");
    assert.notEqual(r, i);
  });

  it("structured idempotency errors expose machine-readable codes", () => {
    const err = new MutationIdempotencyError(
      "OPERATION_IN_PROGRESS",
      "This operation is still processing",
      409,
      true,
    );
    const pub = toPublicErrorPayload(err);
    assert.equal(pub.code, "OPERATION_IN_PROGRESS");
    assert.equal(pub.retryable, true);
  });

  it("multipart incomplete-return hash ignores blob URLs", () => {
    const logical = hashRequestPayload({
      action: "incomplete_return",
      photo_content_hash: "abc",
      items: [{ booking_item_id: 1, photo_content_hash: "def" }],
    });
    const withUrls = hashRequestPayload({
      action: "incomplete_return",
      photo_content_hash: "abc",
      items: [{ booking_item_id: 1, photo_content_hash: "def" }],
      // blob URL must not be part of canonical identity
    });
    assert.equal(logical, withUrls);
    const differentPhoto = hashRequestPayload({
      action: "incomplete_return",
      photo_content_hash: "zzz",
      items: [{ booking_item_id: 1, photo_content_hash: "def" }],
    });
    assert.notEqual(logical, differentPhoto);
  });
});
