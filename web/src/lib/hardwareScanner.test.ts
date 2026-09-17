import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isBookingQrScanPayload,
  looksLikeDressScanCode,
  normalizeHardwareScanCode,
} from "./hardwareScanner";

describe("hardwareScanner", () => {
  it("detects signed booking bill QR payloads", () => {
    const url =
      "https://fcmanage.vercel.app/booking/qr/abc-123?s=deadbeef";
    assert.equal(isBookingQrScanPayload(url), true);
    assert.equal(isBookingQrScanPayload("QR-DRESS-001"), false);
  });

  it("normalizes scanner line endings", () => {
    assert.equal(normalizeHardwareScanCode("QR-001\r\n"), "QR-001");
  });

  it("treats dress names as search text, not scan codes", () => {
    assert.equal(looksLikeDressScanCode("ROYAL PINK"), false);
    assert.equal(looksLikeDressScanCode("LEHENGA"), false);
    assert.equal(looksLikeDressScanCode("red lehenga"), false);
  });

  it("detects SKU / barcode / QR scan codes", () => {
    assert.equal(looksLikeDressScanCode("12345678"), true);
    assert.equal(looksLikeDressScanCode("SKU-001"), true);
    assert.equal(looksLikeDressScanCode("A2B3C4D5"), true);
    assert.equal(
      looksLikeDressScanCode(
        "https://fcmanage.vercel.app/booking/qr/abc-123?s=deadbeef",
      ),
      true,
    );
  });
});
