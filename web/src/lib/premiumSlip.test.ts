import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PREMIUM_SLIP_HEADER_KIND,
  PREMIUM_SLIP_HEADER_VALIDATED,
  PREMIUM_SLIP_HEADER_VERSION,
  PREMIUM_SLIP_TEMPLATE_VERSION,
  assertPremiumSlipPdf,
  assertPremiumSlipRenderHeaders,
  premiumSlipMarker,
  PremiumSlipValidationError,
} from "./premiumSlip";

function fakePdf(body = "", size = 9000): Buffer {
  const padding = " ".repeat(Math.max(0, size - body.length - 8));
  return Buffer.from(`%PDF-1.4\n${body}${padding}`, "latin1");
}

/** Simulates a valid Chromium PDF where text streams are compressed (marker not in latin1). */
function compressedChromiumPdf(): Buffer {
  return fakePdf("\x93\x8c\x8b\x9e binary stream payload /Type /Page without readable marker text", 12000);
}

describe("premiumSlip", () => {
  it("uses stable template version", () => {
    assert.equal(PREMIUM_SLIP_TEMPLATE_VERSION, "premium-slip-v1");
    assert.equal(premiumSlipMarker("delivery"), "PREMIUM_SLIP:premium-slip-v1:delivery");
  });

  it("accepts valid Chromium PDF even when marker text is compressed away", () => {
    const pdf = compressedChromiumPdf();
    assert.doesNotThrow(() => assertPremiumSlipPdf(pdf, "delivery"));
  });

  it("rejects tiny PDF", () => {
    const pdf = Buffer.from("%PDF-1.4 tiny");
    assert.throws(() => assertPremiumSlipPdf(pdf, "booking"), PremiumSlipValidationError);
  });

  it("rejects jsPDF-style fallback body", () => {
    const pdf = fakePdf("DELIVERY SLIP Thank you for choosing Fancy Collection.");
    assert.throws(() => assertPremiumSlipPdf(pdf, "delivery"), PremiumSlipValidationError);
  });

  it("rejects PDF without %PDF header", () => {
    const pdf = fakePdf("NOTPDF", 9000);
    pdf[0] = 0x4e;
    assert.throws(() => assertPremiumSlipPdf(pdf, "booking"), PremiumSlipValidationError);
  });

  it("assertPremiumSlipRenderHeaders requires authenticated renderer headers", () => {
    const headers = new Headers({
      [PREMIUM_SLIP_HEADER_VALIDATED]: "1",
      [PREMIUM_SLIP_HEADER_KIND]: "booking",
      [PREMIUM_SLIP_HEADER_VERSION]: PREMIUM_SLIP_TEMPLATE_VERSION,
    });
    assert.doesNotThrow(() => assertPremiumSlipRenderHeaders(headers, "booking"));

    const wrongKind = new Headers({
      [PREMIUM_SLIP_HEADER_VALIDATED]: "1",
      [PREMIUM_SLIP_HEADER_KIND]: "delivery",
      [PREMIUM_SLIP_HEADER_VERSION]: PREMIUM_SLIP_TEMPLATE_VERSION,
    });
    assert.throws(() => assertPremiumSlipRenderHeaders(wrongKind, "booking"), PremiumSlipValidationError);
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
