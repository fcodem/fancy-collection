import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  deliveryDatesFromRow,
  normalizeDeliveryDatesInput,
  parseDeliveryDatesJson,
  parseOptionalEnquiryDate,
  serializeShopEnquiry,
  shopEnquiryWriteData,
} from "./shopEnquiry";

describe("shopEnquiry helpers", () => {
  it("parseOptionalEnquiryDate returns null for empty values", () => {
    assert.equal(parseOptionalEnquiryDate(null), null);
    assert.equal(parseOptionalEnquiryDate(undefined), null);
    assert.equal(parseOptionalEnquiryDate(""), null);
    assert.equal(parseOptionalEnquiryDate("   "), null);
  });

  it("parseOptionalEnquiryDate parses ISO date prefix", () => {
    const d = parseOptionalEnquiryDate("2026-07-20T15:00:00.000Z");
    assert.ok(d instanceof Date);
    assert.equal(d!.toISOString().slice(0, 10), "2026-07-20");
  });

  it("normalizeDeliveryDatesInput deduplicates and sorts", () => {
    assert.deepEqual(
      normalizeDeliveryDatesInput(["2026-09-15", "2026-09-01", "2026-09-15", ""]),
      ["2026-09-01", "2026-09-15"],
    );
  });

  it("shopEnquiryWriteData stores multiple delivery dates and clears address", () => {
    const data = shopEnquiryWriteData({
      customer_name: " Priya ",
      customer_address: " 123 Main ",
      contact_1: " 9876543210 ",
      whatsapp_no: "",
      enquiry_notes: " Wedding dress ",
      staff_names: ["Alice", "Bob"],
      visit_date: "2026-07-19",
      delivery_dates: ["2026-08-01", "2026-08-15"],
    });

    assert.equal(data.customerName, "Priya");
    assert.equal(data.customerAddress, null);
    assert.equal(data.contact1, "9876543210");
    assert.equal(data.enquiryNotes, "Wedding dress");
    assert.equal(data.deliveryDates, '["2026-08-01","2026-08-15"]');
    assert.equal(data.dressNeededDate?.toISOString().slice(0, 10), "2026-08-01");
  });

  it("shopEnquiryWriteData clears delivery dates when omitted", () => {
    const data = shopEnquiryWriteData({
      customer_name: "Test",
      delivery_dates: [],
    });
    assert.equal(data.deliveryDates, null);
    assert.equal(data.dressNeededDate, null);
  });

  it("serializeShopEnquiry exposes delivery_dates array", () => {
    const row = {
      id: 1,
      customerName: "Test",
      customerAddress: null,
      contact1: null,
      whatsappNo: null,
      enquiryNotes: null,
      staffNames: "Alice",
      visitDate: new Date("2026-07-19T00:00:00.000Z"),
      dressNeededDate: new Date("2026-08-01T00:00:00.000Z"),
      deliveryDates: '["2026-08-01","2026-08-20"]',
      createdAt: new Date("2026-07-19T12:00:00.000Z"),
    };
    const out = serializeShopEnquiry(row);
    assert.deepEqual(out.delivery_dates, ["2026-08-01", "2026-08-20"]);
    assert.equal(out.dress_needed_date, "2026-08-01");
  });

  it("deliveryDatesFromRow falls back to legacy dressNeededDate", () => {
    assert.deepEqual(
      deliveryDatesFromRow({
        deliveryDates: null,
        dressNeededDate: new Date("2026-08-01T00:00:00.000Z"),
      }),
      ["2026-08-01"],
    );
  });

  it("parseDeliveryDatesJson reads stored JSON", () => {
    assert.deepEqual(parseDeliveryDatesJson('["2026-09-01","2026-09-10"]'), [
      "2026-09-01",
      "2026-09-10",
    ]);
  });
});
