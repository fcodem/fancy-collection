import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BookingFormSchema, formatZodValidationError } from "./validation";

const validBase = {
  customer_name: "Test User",
  customer_address: "123 Main St",
  contact_1: "9876543210",
  whatsapp_no: "",
  payment_mode: "cash" as const,
  delivery_date: "2026-07-20",
  delivery_time: "12:00 Noon",
  return_date: "2026-07-21",
  return_time: "12:00 Noon",
  items: [{ item_id: 1, dress_name: "Lehenga", price: 5000, advance: 1000, notes: "" }],
};

describe("BookingFormSchema", () => {
  it("accepts a realistic new-booking payload", () => {
    const r = BookingFormSchema.safeParse({
      ...validBase,
      orders: [
        {
          description: "Blouse stitching",
          cost: 500,
          advance: 200,
          delivery_date: "2026-07-20",
          delivery_time: "12:00 Noon",
        },
      ],
      client_request_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    assert.equal(r.success, true);
  });

  it("drops blank custom-order rows before validating", () => {
    const r = BookingFormSchema.safeParse({
      ...validBase,
      orders: [
        { description: " ", cost: 0, advance: 0, delivery_date: "", delivery_time: "12:00 Noon" },
        {
          description: "Dupatta",
          cost: 0,
          advance: 0,
          delivery_date: "2026-07-20",
          delivery_time: "12:00 Noon",
        },
      ],
    });
    assert.equal(r.success, true);
    if (r.success) assert.equal(r.data.orders?.length, 1);
  });

  it("coerces NaN security_deposit to omitted", () => {
    const r = BookingFormSchema.safeParse({ ...validBase, security_deposit: NaN });
    assert.equal(r.success, true);
    if (r.success) assert.equal(r.data.security_deposit, undefined);
  });

  it("rejects null item_id with a field-aware error", () => {
    const r = BookingFormSchema.safeParse({
      ...validBase,
      items: [{ item_id: null, dress_name: "X", price: 0, advance: 0, notes: "" }],
    });
    assert.equal(r.success, false);
    if (!r.success) {
      const msg = formatZodValidationError(r.error);
      assert.match(msg, /Dress \(row 1\)/i);
    }
  });
});

describe("formatZodValidationError", () => {
  it("includes order field labels", () => {
    const r = BookingFormSchema.safeParse({
      ...validBase,
      orders: [
        {
          description: "Blouse",
          cost: 0,
          advance: 0,
          delivery_date: "",
          delivery_time: "12:00 Noon",
        },
      ],
    });
    assert.equal(r.success, false);
    if (!r.success) {
      assert.match(formatZodValidationError(r.error), /Order delivery date/i);
    }
  });
});
