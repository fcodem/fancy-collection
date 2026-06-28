import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyNumericSearch, digitsOnly } from "./bookingSearchCore";

describe("classifyNumericSearch (search regression)", () => {
  it("treats 1–3 digits as monthly serial", () => {
    assert.equal(classifyNumericSearch("1"), "serial");
    assert.equal(classifyNumericSearch("12"), "serial");
    assert.equal(classifyNumericSearch("123"), "serial");
  });

  it("treats >3 digits as phone/WhatsApp", () => {
    assert.equal(classifyNumericSearch("1234"), "phone");
    assert.equal(classifyNumericSearch("9876543210"), "phone");
  });

  it("treats formatted phone numbers as phone when >3 digits extracted", () => {
    assert.equal(classifyNumericSearch("+91 98765 43210"), "phone");
    assert.ok(digitsOnly("+91 98765 43210").length > 3);
  });

  it("returns null for non-numeric text", () => {
    assert.equal(classifyNumericSearch("rahul"), null);
    assert.equal(classifyNumericSearch("dress blue"), null);
  });
});
