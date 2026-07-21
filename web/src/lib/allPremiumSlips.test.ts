import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (relative: string) =>
  fs.readFileSync(path.join(process.cwd(), relative), "utf8");

function sliceFn(source: string, start: string, end: string): string {
  const a = source.indexOf(start);
  if (a < 0) return "";
  if (end === "// EOF") return source.slice(a);
  const b = source.indexOf(end, a + start.length);
  if (b < 0) return source.slice(a);
  return source.slice(a, b);
}

const SLIP_SENDERS = [
  { name: "booking_bill", start: "export async function sendBookingBillWhatsApp", end: "export async function sendPostponementNoticeWhatsApp" },
  { name: "return_receipt", start: "export async function sendReturnReceiptWhatsApp", end: "type SlipJobScope" },
  { name: "delivery_slip", start: "export async function sendDeliverySlipWhatsApp", end: "export async function sendPartialReturnSlipWhatsApp" },
  { name: "return_slip", start: "export async function sendPartialReturnSlipWhatsApp", end: "export async function sendIncompleteSlipWhatsApp" },
  { name: "incomplete_slip", start: "export async function sendIncompleteSlipWhatsApp", end: "// EOF" },
] as const;

describe("all premium slips — no customer jsPDF fallback", () => {
  const automated = read("src/lib/services/whatsapp/automatedMessages.ts");

  it("does not import jsPDF fallback generators for customer sends", () => {
    assert.doesNotMatch(automated, /generateBookingBillPdfFallback/);
    assert.doesNotMatch(automated, /generateOperationSlipPdfFallback/);
    assert.doesNotMatch(automated, /renderSlipWithFallback/);
  });

  for (const sender of SLIP_SENDERS) {
    it(`${sender.name} fails retryable without jsPDF fallback`, () => {
      const fn = sliceFn(automated, sender.start, sender.end);
      assert.doesNotMatch(fn, /jsPDF fallback/i);
      assert.doesNotMatch(fn, /generateOperationSlipPdfFallback/);
      assert.doesNotMatch(fn, /generateBookingBillPdfFallback/);
      assert.match(fn, /generateValidatedPremiumSlipPdf/);
      assert.match(fn, /failPremiumSlipRender/);
    });
  }
});
