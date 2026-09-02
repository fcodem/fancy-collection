import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isBookingQrScanPayload,
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
});
