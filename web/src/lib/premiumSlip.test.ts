import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PREMIUM_SLIP_TEMPLATE_VERSION,
  assertPremiumSlipPdf,
  premiumSlipMarker,
  PremiumSlipValidationError,
} from "./premiumSlip";

function fakePdf(text: string): Buffer {
  return Buffer.from(`%PDF-1.4\n${text.padEnd(9000, " ")}`, "latin1");
}

describe("premiumSlip", () => {
  it("uses stable template version", () => {
    assert.equal(PREMIUM_SLIP_TEMPLATE_VERSION, "premium-slip-v1");
    assert.equal(premiumSlipMarker("delivery"), "PREMIUM_SLIP:premium-slip-v1:delivery");
  });

  it("accepts PDF with marker and required delivery labels", () => {
    const pdf = fakePdf(
      `${premiumSlipMarker("delivery")} DELIVERED Please Return All Items By Delivery Payment Summary`,
    );
    assert.doesNotThrow(() => assertPremiumSlipPdf(pdf, "delivery"));
  });

  it("rejects tiny PDF without premium marker", () => {
    const pdf = Buffer.from("%PDF-1.4 tiny");
    assert.throws(() => assertPremiumSlipPdf(pdf, "booking"), PremiumSlipValidationError);
  });

  it("rejects jsPDF-style fallback body", () => {
    const pdf = fakePdf("DELIVERY SLIP Thank you for choosing Fancy Collection.");
    assert.throws(() => assertPremiumSlipPdf(pdf, "delivery"), PremiumSlipValidationError);
  });

  it("PremiumSlipRenderError is retryable with code", async () => {
    const { PremiumSlipRenderError, PREMIUM_SLIP_RENDER_FAILED } = await import(
      "./services/whatsapp/slipRenderErrors"
    );
    const err = new PremiumSlipRenderError("ENOSPC", "ENOSPC");
    assert.equal(err.code, PREMIUM_SLIP_RENDER_FAILED);
    assert.equal(err.retryable, true);
  });
});
