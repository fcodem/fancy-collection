import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

const SLIP_SENDERS: Array<{ name: string; start: string; end: string; kind: string }> = [
  {
    name: "sendBookingBillWhatsApp",
    start: "export async function sendBookingBillWhatsApp",
    end: "export async function sendPostponementNoticeWhatsApp",
    kind: "booking",
  },
  {
    name: "sendReturnReceiptWhatsApp",
    start: "export async function sendReturnReceiptWhatsApp",
    end: "type SlipJobScope",
    kind: "return",
  },
  {
    name: "sendDeliverySlipWhatsApp",
    start: "export async function sendDeliverySlipWhatsApp",
    end: "export async function sendPartialReturnSlipWhatsApp",
    kind: "delivery",
  },
  {
    name: "sendPartialReturnSlipWhatsApp",
    start: "export async function sendPartialReturnSlipWhatsApp",
    end: "export async function sendIncompleteSlipWhatsApp",
    kind: "return",
  },
  {
    name: "sendIncompleteSlipWhatsApp",
    start: "export async function sendIncompleteSlipWhatsApp",
    end: "",
    kind: "incomplete",
  },
];

function sliceFn(source: string, start: string, end: string): string {
  const a = source.indexOf(start);
  assert.ok(a >= 0, `missing ${start}`);
  const b = end ? source.indexOf(end, a + 1) : source.length;
  assert.ok(b > a, `missing end marker after ${start}`);
  return source.slice(a, b);
}

describe("all premium slips — jsPDF fallback after Chromium failure", () => {
  const automated = read("src/lib/services/whatsapp/automatedMessages.ts");

  it("imports jsPDF fallback generators", () => {
    assert.match(automated, /generateBookingBillPdfFallback/);
    assert.match(automated, /generateOperationSlipPdfFallback/);
    assert.match(automated, /renderSlipWithFallback/);
  });

  for (const sender of SLIP_SENDERS) {
    it(`${sender.name} uses premium then jsPDF fallback`, () => {
      const fn = sliceFn(automated, sender.start, sender.end);
      assert.match(fn, /renderSlipWithFallback/);
      assert.doesNotMatch(fn, /failPremiumSlipRender/);
    });
  }
});

describe("premium slip components embed validation markers", () => {
  it("BookingSlip", () => {
    assert.match(read("src/components/BookingSlip.tsx"), /PremiumSlipMarker kind="booking"/);
  });
  it("DeliverySlip", () => {
    assert.match(read("src/components/DeliverySlip.tsx"), /PremiumSlipMarker kind="delivery"/);
  });
  it("ReturnSlip", () => {
    assert.match(read("src/components/ReturnSlip.tsx"), /PremiumSlipMarker kind="return"/);
  });
  it("IncompleteReturnSlip", () => {
    assert.match(read("src/components/IncompleteReturnSlip.tsx"), /PremiumSlipMarker kind="incomplete"/);
  });
});

describe("slip data builders use catalog photos", () => {
  it("delivery, return, booking, incomplete builders", () => {
    const data = read("src/lib/slipBookingData.ts");
    assert.match(data, /inventoryPhotoRef/);
    assert.match(data, /mapSlipItem/);
    assert.match(data, /mapReturnSlipItem/);
    assert.match(data, /photoUrl|catalogPhotoUrl/);
  });
});
