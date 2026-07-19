import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
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

  it("shopEnquiryWriteData maps API body to prisma fields", () => {
    const data = shopEnquiryWriteData({
      customer_name: " Priya ",
      customer_address: " 123 Main ",
      contact_1: " 9876543210 ",
      whatsapp_no: "",
      enquiry_notes: " Wedding dress ",
      staff_names: ["Alice", "Bob"],
      visit_date: "2026-07-19",
      dress_needed_date: "2026-08-01",
    });

    assert.equal(data.customerName, "Priya");
    assert.equal(data.customerAddress, "123 Main");
    assert.equal(data.contact1, "9876543210");
    assert.equal(data.whatsappNo, null);
    assert.equal(data.enquiryNotes, "Wedding dress");
    assert.equal(data.staffNames, "Alice, Bob");
    assert.equal(data.visitDate.toISOString().slice(0, 10), "2026-07-19");
    assert.equal(data.dressNeededDate?.toISOString().slice(0, 10), "2026-08-01");
  });

  it("shopEnquiryWriteData clears dressNeededDate when omitted", () => {
    const data = shopEnquiryWriteData({
      customer_name: "Test",
      dress_needed_date: null,
    });
    assert.equal(data.dressNeededDate, null);
  });

  it("serializeShopEnquiry exposes dress_needed_date", () => {
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
      createdAt: new Date("2026-07-19T12:00:00.000Z"),
    };
    const out = serializeShopEnquiry(row);
    assert.equal(out.dress_needed_date, "2026-08-01");
    assert.deepEqual(out.staff_names, ["Alice"]);
  });
});
