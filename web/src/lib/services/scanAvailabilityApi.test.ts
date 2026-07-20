import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  createBoundedTtlCache,
  hashScanCode,
  parseScanAvailabilityRequest,
  ScanAvailabilityRequestError,
  scanAvailabilityCacheKey,
  scanAvailabilityHttpStatus,
  serializeScanAvailability,
} from "./scanAvailabilityApi";
import type {
  ScannedDressAvailabilityResult,
  ScannedDressBookingRecord,
} from "./scannedDressAvailability";

const ROUTE_PATH = "src/app/api/dress-checker/scan-availability/route.ts";
const route = fs.readFileSync(path.join(process.cwd(), ROUTE_PATH), "utf8");

function record(
  reason: ScannedDressBookingRecord["reason"],
): ScannedDressBookingRecord {
  return {
    bookingId: 900,
    bookingNumber: "BK-0726-120",
    monthlySerial: 120,
    customerName: "Customer",
    contact: "9812345678",
    dressName: "Red Bridal Lehenga",
    deliveryDate: "2026-07-26",
    deliveryTime: "12:00 Noon",
    returnDate: "2026-07-28",
    returnTime: "11:00 AM",
    bookingStatus: "booked",
    itemStatus: "booked",
    reason,
  };
}

function resultWith(
  status: ScannedDressAvailabilityResult["status"],
  overrides?: Partial<ScannedDressAvailabilityResult>,
): ScannedDressAvailabilityResult {
  return {
    status,
    dress: {
      id: 123,
      name: "Red Bridal Lehenga",
      sku: "BR-001",
      category: "Lehenga",
      size: "40",
      color: "Red",
      status: "available",
      thumbnailUrl: "/thumbs/br-001.webp",
    },
    blockingRecords: [],
    warningRecords: [],
    timings: { codeLookupMs: 2, conflictQueryMs: 5, classificationMs: 0 },
    ...overrides,
  };
}

describe("scan availability request validation", () => {
  const valid = {
    code: "FC-D-7K4P9X2M",
    deliveryDateTime: "2026-07-28T16:00:00+05:30",
    returnDateTime: "2026-07-30T11:00:00+05:30",
    excludeBookingId: null,
  };

  it("accepts a valid request and passes leading zeros through untouched", () => {
    const parsed = parseScanAvailabilityRequest({ ...valid, code: "007" });
    assert.equal(parsed.code, "007");
    assert.equal(parsed.excludeBookingId, null);
  });

  it("rejects missing/oversized codes and invalid dates with 400", () => {
    const bad: Array<Record<string, unknown>> = [
      { ...valid, code: undefined },
      { ...valid, code: "" },
      { ...valid, code: 12345 },
      { ...valid, code: "x".repeat(513) },
      { ...valid, deliveryDateTime: "" },
      { ...valid, returnDateTime: undefined },
      { ...valid, deliveryDateTime: "y".repeat(65) },
      { ...valid, excludeBookingId: "900" },
      { ...valid, excludeBookingId: -1 },
      { ...valid, excludeBookingId: 2.5 },
    ];
    for (const body of bad) {
      assert.throws(
        () => parseScanAvailabilityRequest(body),
        (error: unknown) =>
          error instanceof ScanAvailabilityRequestError && error.httpStatus === 400,
      );
    }
    assert.throws(() => parseScanAvailabilityRequest(null));
    assert.throws(() => parseScanAvailabilityRequest([1]));
  });
});

describe("scan availability response contract", () => {
  it("serializes AVAILABLE with the dress summary and timing", () => {
    const payload = serializeScanAvailability(resultWith("AVAILABLE"), {
      authMs: 3,
      totalMs: 42,
      cacheStatus: "miss",
    });
    assert.equal(payload.ok, true);
    assert.equal(payload.status, "AVAILABLE");
    assert.equal(payload.dress?.colour, "Red");
    assert.equal(payload.dress?.thumbnailUrl, "/thumbs/br-001.webp");
    assert.deepEqual(payload.blockingRecords, []);
    assert.equal(payload.timing.totalMs, 42);
    assert.equal(scanAvailabilityHttpStatus("AVAILABLE"), 200);
  });

  it("keeps BOOKED as HTTP 200 with blocking records", () => {
    const payload = serializeScanAvailability(
      resultWith("BOOKED", { blockingRecords: [record("OVERLAPPING_BOOKING")] }),
      { totalMs: 10 },
    );
    assert.equal(payload.ok, true);
    assert.equal(payload.status, "BOOKED");
    assert.equal(payload.blockingRecords.length, 1);
    assert.equal(payload.blockingRecords[0].deliveryDateTime, "2026-07-26 12:00 Noon");
    assert.equal(scanAvailabilityHttpStatus("BOOKED"), 200);
  });

  it("serializes both warning types with reasons", () => {
    for (const [status, reason] of [
      ["WARNING_RETURNING_ON_DELIVERY_DAY", "RETURNING_ON_DELIVERY_DAY"],
      ["WARNING_BOOKED_ON_RETURN_DAY", "BOOKED_ON_RETURN_DAY"],
    ] as const) {
      const payload = serializeScanAvailability(
        resultWith(status, { warningRecords: [record(reason)] }),
        { totalMs: 5 },
      );
      assert.equal(payload.ok, true);
      assert.equal(payload.warningRecords[0].reason, reason);
      assert.equal(scanAvailabilityHttpStatus(status), 200);
    }
  });

  it("maps CODE_NOT_FOUND to HTTP 200 with a structured not-linked card", () => {
    const payload = serializeScanAvailability(
      resultWith("CODE_NOT_FOUND", { dress: null }),
      { totalMs: 4 },
    );
    assert.equal(payload.ok, false);
    assert.equal(payload.status, "CODE_NOT_FOUND");
    assert.equal(payload.dress, null);
    assert.match(String(payload.error), /not linked to inventory/i);
    assert.equal(scanAvailabilityHttpStatus("CODE_NOT_FOUND"), 200);
  });

  it("maps AMBIGUOUS_LEGACY_CODE to HTTP 200 with a structured card", () => {
    const payload = serializeScanAvailability(
      resultWith("AMBIGUOUS_LEGACY_CODE", { dress: null }),
      { totalMs: 4 },
    );
    assert.equal(payload.ok, false);
    assert.equal(payload.status, "AMBIGUOUS_LEGACY_CODE");
    assert.match(String(payload.error), /more than one inventory SKU/i);
    assert.equal(scanAvailabilityHttpStatus("AMBIGUOUS_LEGACY_CODE"), 200);
  });

  it("never serializes documents, photos or financial fields", () => {
    const payload = serializeScanAvailability(
      resultWith("BOOKED", { blockingRecords: [record("OVERLAPPING_BOOKING")] }),
      { totalMs: 1 },
    );
    const json = JSON.stringify(payload);
    for (const banned of ["idPhoto", "totalPrice", "advance", "securityDeposit", "aiFingerprint"]) {
      assert.ok(!json.includes(banned), `${banned} must not appear in the response`);
    }
  });
});

describe("scan availability cache", () => {
  it("hashes codes so keys and diagnostics never carry the scanned value", () => {
    const hash = hashScanCode("FC-D-7K4P9X2M");
    assert.match(hash, /^[0-9a-f]{16}$/);
    const key = scanAvailabilityCacheKey({
      userId: 7,
      revision: "402",
      codeHash: hash,
      deliveryDateTime: "2026-07-28T16:00:00+05:30",
      returnDateTime: "2026-07-30T11:00:00+05:30",
      excludeBookingId: null,
    });
    assert.ok(!key.includes("FC-D-7K4P9X2M"));
    assert.ok(key.includes(hash));
  });

  it("serves warm repeats as hits within the TTL", async () => {
    const cache = createBoundedTtlCache<number>({ ttlMs: 20_000, maxEntries: 10 });
    let loads = 0;
    const loader = async () => ++loads;
    const first = await cache.get("k", loader);
    const second = await cache.get("k", loader);
    assert.equal(first.cacheStatus, "miss");
    assert.equal(second.cacheStatus, "hit");
    assert.equal(loads, 1);
  });

  it("expires entries after the TTL — never caches forever", async () => {
    const cache = createBoundedTtlCache<number>({ ttlMs: 5, maxEntries: 10 });
    let loads = 0;
    await cache.get("k", async () => ++loads);
    await new Promise((resolve) => setTimeout(resolve, 15));
    const again = await cache.get("k", async () => ++loads);
    assert.equal(again.cacheStatus, "miss");
    assert.equal(loads, 2);
  });

  it("invalidates after booking mutations because the revision keys the entry", async () => {
    const cache = createBoundedTtlCache<string>({ ttlMs: 20_000, maxEntries: 10 });
    const base = {
      userId: 7,
      codeHash: hashScanCode("FC-D-7K4P9X2M"),
      deliveryDateTime: "2026-07-28T16:00:00+05:30",
      returnDateTime: "2026-07-30T11:00:00+05:30",
      excludeBookingId: null,
    };
    const before = await cache.get(
      scanAvailabilityCacheKey({ ...base, revision: "402" }),
      async () => "AVAILABLE",
    );
    // A booking is created → activity log row → shop revision advances.
    const after = await cache.get(
      scanAvailabilityCacheKey({ ...base, revision: "403" }),
      async () => "BOOKED",
    );
    assert.equal(before.value, "AVAILABLE");
    assert.equal(after.cacheStatus, "miss");
    assert.equal(after.value, "BOOKED");
  });

  it("coalesces concurrent duplicate requests into one load", async () => {
    const cache = createBoundedTtlCache<string>({ ttlMs: 20_000, maxEntries: 10 });
    let loads = 0;
    let release!: (value: string) => void;
    const gate = new Promise<string>((resolve) => {
      release = resolve;
    });
    const loader = () => {
      loads += 1;
      return gate;
    };
    const a = cache.get("k", loader);
    const b = cache.get("k", loader);
    release("AVAILABLE");
    const [ra, rb] = await Promise.all([a, b]);
    assert.equal(loads, 1);
    assert.equal(ra.cacheStatus, "miss");
    assert.equal(rb.cacheStatus, "coalesced");
    assert.equal(rb.value, "AVAILABLE");
  });

  it("stays bounded at maxEntries", async () => {
    const cache = createBoundedTtlCache<number>({ ttlMs: 60_000, maxEntries: 3 });
    for (let i = 0; i < 10; i += 1) {
      await cache.get(`k${i}`, async () => i);
    }
    assert.ok(cache.size() <= 3);
  });

  it("does not cache failed loads", async () => {
    const cache = createBoundedTtlCache<number>({ ttlMs: 60_000, maxEntries: 3 });
    let loads = 0;
    await assert.rejects(
      cache.get("k", async () => {
        loads += 1;
        throw new Error("db down");
      }),
    );
    const retry = await cache.get("k", async () => {
      loads += 1;
      return 1;
    });
    assert.equal(retry.cacheStatus, "miss");
    assert.equal(loads, 2);
  });
});

describe("scan availability route contract", () => {
  it("authenticates via the fast read-session path before any work", () => {
    assert.match(route, /requireFastReadUser\(perf\)/);
    assert.match(route, /isResponse\(user\)/);
    // Auth happens before the body is read/parsed.
    const authIndex = route.indexOf("requireFastReadUser");
    const bodyIndex = route.indexOf("request.json()");
    assert.ok(authIndex >= 0 && bodyIndex > authIndex);
    // Mutation-style auth helpers are not needed on this read-only route.
    assert.doesNotMatch(route, /requireOwner/);
  });

  it("maps invalid ranges to 409 and unexpected failures to a safe 500", () => {
    assert.match(route, /INVALID_DATE_RANGE"\s*\?\s*409\s*:\s*400/);
    assert.match(route, /Unexpected server error/);
    assert.doesNotMatch(route, /error\.stack/);
  });

  it("never logs or caches raw scanned values", () => {
    assert.match(route, /hashScanCode\(normalizedCode\)/);
    assert.match(route, /codeHash/);
    // The only console call reports the hash, never the code or customer data.
    const consoleCalls = route.match(/console\.\w+\([^)]*\)/g) ?? [];
    assert.equal(consoleCalls.length, 1);
    assert.match(consoleCalls[0], /codeHash/);
    assert.doesNotMatch(consoleCalls[0], /input\.code|rawCode|normalizedCode|customerName/);
  });

  it("uses a short bounded revision-keyed cache and logs safe timing fields", () => {
    assert.match(route, /CACHE_TTL_MS = 20_000/);
    assert.match(route, /CACHE_MAX_ENTRIES/);
    assert.match(route, /getFreshShopRevision\(\)/);
    for (const field of [
      "authMs",
      "codeLookupMs",
      "conflictQueryMs",
      "classificationMs",
      "totalMs",
      "cacheStatus",
    ]) {
      assert.match(route, new RegExp(field));
    }
  });

  it("stays lean: no category/AI/PDF/Blob/image work on the scan path", () => {
    for (const banned of [
      "aiJob",
      "recognitionPipeline",
      "siglip",
      "puppeteer",
      "sharp",
      "jspdf",
      "@vercel/blob",
      "category:",
      "clothingItem.findMany",
    ]) {
      assert.ok(!route.includes(banned), `route must not reference ${banned}`);
    }
    const service = fs.readFileSync(
      path.join(process.cwd(), "src/lib/services/scannedDressAvailability.ts"),
      "utf8",
    );
    for (const banned of ["aiJob", "siglip", "puppeteer", "sharp", "jspdf", "@vercel/blob"]) {
      assert.ok(!service.includes(banned), `service must not reference ${banned}`);
    }
  });
});
