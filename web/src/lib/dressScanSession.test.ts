import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  createScanDedupeGate,
  isCurrentScanGeneration,
  normalizeSessionScanCode,
  ScanWindowValidationError,
  validateScanWindow,
} from "./dressScanSession";

const read = (relative: string) =>
  fs.readFileSync(path.join(process.cwd(), relative), "utf8");

describe("scan booking window validation", () => {
  it("builds explicit Asia/Kolkata instants", () => {
    const result = validateScanWindow({
      deliveryDate: "2026-07-28",
      deliveryTime: "16:00",
      returnDate: "2026-07-30",
      returnTime: "11:00",
    });
    assert.equal(result.deliveryDateTime, "2026-07-28T16:00:00+05:30");
    assert.equal(result.returnDateTime, "2026-07-30T11:00:00+05:30");
  });

  it("requires every date/time field and rejects invalid ranges", () => {
    const valid = {
      deliveryDate: "2026-07-28",
      deliveryTime: "16:00",
      returnDate: "2026-07-30",
      returnTime: "11:00",
    };
    for (const field of Object.keys(valid) as Array<keyof typeof valid>) {
      assert.throws(
        () => validateScanWindow({ ...valid, [field]: "" }),
        ScanWindowValidationError,
      );
    }
    assert.throws(
      () =>
        validateScanWindow({
          ...valid,
          returnDate: "2026-07-28",
          returnTime: "16:00",
        }),
      /must be after/i,
    );
    assert.throws(
      () => validateScanWindow({ ...valid, deliveryDate: "2026-02-31" }),
      /valid delivery and return dates/i,
    );
  });
});

describe("continuous scan duplicate suppression", () => {
  it("normalizes text while preserving barcode leading zeros", () => {
    assert.equal(normalizeSessionScanCode("  0012345678\r\n"), "0012345678");
    assert.equal(normalizeSessionScanCode("fc-d-ab12"), "FC-D-AB12");
  });

  it("locks duplicate decode callbacks synchronously for 1.5 seconds", () => {
    const gate = createScanDedupeGate(1_500);
    assert.equal(gate.claim("00123", 1_000).accepted, true);
    const callback = gate.claim("00123", 1_010);
    assert.deepEqual(callback, {
      accepted: false,
      reason: "callback-lock",
      code: "00123",
    });
  });

  it("suppresses session duplicates and permits explicit recheck/removal", () => {
    const gate = createScanDedupeGate(1_500);
    assert.equal(gate.claim("A", 1_000).accepted, true);
    assert.equal(gate.claim("A", 3_000).accepted, false);
    assert.equal(gate.claim("A", 3_001, true).accepted, true);
    gate.forget("A");
    assert.equal(gate.claim("A", 5_000).accepted, true);
  });

  it("protects against late responses from old date generations", () => {
    assert.equal(isCurrentScanGeneration(4, 4), true);
    assert.equal(isCurrentScanGeneration(4, 5), false);
  });
});

describe("scan session persistence", () => {
  it("exports session storage helpers for back navigation", async () => {
    const mod = await import("./dressScanSession");
    assert.equal(typeof mod.readPersistedScanSession, "function");
    assert.equal(typeof mod.writePersistedScanSession, "function");
    assert.equal(typeof mod.clearPersistedScanSession, "function");
    assert.equal(mod.DRESS_SCAN_SESSION_STORAGE_KEY, "dress-scan-availability-session");
  });
});

describe("Scan Dress Availability UI contracts", () => {
  const component = read("src/components/DressAvailabilityScanner.tsx");
  const scanPage = read("src/app/inventory/search/scan/page.tsx");
  const photoPage = read("src/app/inventory/search/page.tsx");
  const camera = read("src/lib/cameraScanner.ts");
  const bookingQr = read("src/components/SearchQrClient.tsx");

  it("keeps the existing AI/photo checker and adds a separate scan mode", () => {
    assert.match(photoPage, /InventorySearchClient/);
    assert.match(photoPage, /Scan Dress Availability/);
    assert.match(scanPage, /DressAvailabilityScanner/);
    assert.match(scanPage, /AI \/ Photo Dress Checker/);
  });

  it("does not open the camera before validated dates", () => {
    const validateIndex = component.indexOf("validateScanWindow");
    const phaseIndex = component.indexOf('setPhase("scanning")');
    assert.ok(validateIndex >= 0 && phaseIndex > validateIndex);
    assert.match(component, /phase !== "scanning"/);
  });

  it("keeps one camera session alive between successful scans", () => {
    assert.equal((component.match(/new QrCameraSession/g) || []).length, 1);
    assert.doesNotMatch(component, /stopAfterDecode|stopImmediately/);
    assert.match(camera, /pause\(\): void/);
    assert.match(camera, /resume\(\): void/);
  });

  it("uses a controlled request queue, AbortController and generation guard", () => {
    assert.match(component, /queueRef/);
    assert.match(component, /requestActiveRef/);
    assert.match(component, /new AbortController/);
    assert.match(component, /generationRef/);
    assert.match(component, /isCurrentScanGeneration/);
    assert.match(component, /abortRef\.current\?\.abort/);
  });

  it("supports all continuous scanning controls and keyboard scanners", () => {
    for (const label of [
      "Pause Camera",
      "Resume Camera",
      "Change Dates",
      "Clear Scanned List",
      "Remove One Result",
      "Scan Again",
      "Manual Code Entry",
      "Recheck",
      "Switch Camera",
    ]) {
      assert.match(component, new RegExp(label));
    }
    assert.match(component, /<form[\s\S]*onSubmit=\{submitManual\}/);
    assert.match(component, /setManualCode\(""\)/);
  });

  it("renders visual status text and every booking/warning record", () => {
    for (const text of [
      "Available for selected dates",
      "Booked during the selected period",
      "returning on your delivery date",
      "another booking on your return date",
      "BOTH BOUNDARY WARNINGS",
      "MAINTENANCE",
      "NOT FOUND",
    ]) {
      assert.match(component, new RegExp(text, "i"));
    }
    assert.match(component, /result\.blockingRecords/);
    assert.match(component, /result\.warningRecords/);
  });

  it("does not import categories, dashboards, PDFs, AI, or inventory lists", () => {
    for (const banned of [
      "CategorySelect",
      "/api/categories",
      "/api/dashboard",
      "jspdf",
      "puppeteer",
      "dressChecker/search",
      "inventory/list",
      "originalPhoto",
    ]) {
      assert.ok(!component.includes(banned), `scanner must not include ${banned}`);
      assert.ok(!scanPage.includes(banned), `scan page must not include ${banned}`);
    }
  });

  it("never confuses inventory dress codes with booking-record QR tokens", () => {
    assert.match(component, /\/api\/dress-checker\/scan-availability/);
    assert.doesNotMatch(component, /\/api\/booking\/qr\/resolve/);
    assert.match(bookingQr, /\/api\/booking\/qr\/resolve/);
    assert.doesNotMatch(bookingQr, /\/api\/dress-checker\/scan-availability/);
  });

  it("shows booking record actions without prefetching booking routes", () => {
    assert.match(component, /Open Booking Record/);
    assert.match(component, /prefetch=\{false\}/);
    assert.match(component, /scanRecordReasonLabel/);
    assert.match(component, /readPersistedScanSession/);
    assert.match(component, /writePersistedScanSession/);
  });
});
