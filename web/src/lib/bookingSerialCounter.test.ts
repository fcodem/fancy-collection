import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { deliveryYearMonthKey, previewNextMonthlySerial } from "./bookingSerialCounter";
import { BUSINESS_TIMEZONE } from "./constants";

describe("bookingSerialCounter", () => {
  it("deliveryYearMonthKey uses YYYY-MM from iso date string", () => {
    assert.equal(deliveryYearMonthKey("2026-07-20"), "2026-07");
  });

  it("deliveryYearMonthKey uses Asia/Kolkata for timestamps near month boundary", () => {
    const d = new Date("2026-01-31T20:00:00.000Z");
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: BUSINESS_TIMEZONE,
      year: "numeric",
      month: "2-digit",
    }).formatToParts(d);
    const y = parts.find((p) => p.type === "year")!.value;
    const m = parts.find((p) => p.type === "month")!.value;
    assert.equal(deliveryYearMonthKey(d), `${y}-${m}`);
  });

  it("previewNextMonthlySerial skips unlucky numbers from counter row", async () => {
    const client = {
      $queryRaw: async () => [{ lastSerial: 3 }],
    };
    assert.equal(await previewNextMonthlySerial("2026-08-01", client), 5);
  });

  it("previewNextMonthlySerial returns 1 when counter row missing", async () => {
    const client = {
      $queryRaw: async () => [],
    };
    assert.equal(await previewNextMonthlySerial("2026-09-01", client), 1);
  });
});
