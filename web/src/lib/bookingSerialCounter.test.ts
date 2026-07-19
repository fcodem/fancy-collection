import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deliveryYearMonthKey, previewNextMonthlySerial } from "./bookingSerialCounter";
import { BUSINESS_TIMEZONE } from "./constants";

const source = readFileSync(join(process.cwd(), "src", "lib", "bookingSerialCounter.ts"), "utf8");
const backfillSource = readFileSync(
  join(process.cwd(), "scripts", "backfill-booking-serial-counter.ts"),
  "utf8",
);

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

describe("booking serial counter concurrency contracts", () => {
  it("allocates atomically via INSERT ON CONFLICT without scanning bookings", () => {
    const allocateBlock = source.slice(
      source.indexOf("export async function allocateMonthlySerial"),
      source.indexOf("export async function previewNextMonthlySerial"),
    );
    assert.match(allocateBlock, /INSERT INTO booking_serial_counter/);
    assert.match(allocateBlock, /ON CONFLICT \(year_month\)/);
    assert.match(allocateBlock, /RETURNING last_serial AS "lastSerial"/);
    assert.doesNotMatch(allocateBlock, /FROM bookings/);
    assert.doesNotMatch(allocateBlock, /booking\.aggregate|booking\.count|booking\.findFirst/);
  });

  it("preview reads one counter row and never reserves a serial", () => {
    const previewBlock = source.slice(
      source.indexOf("export async function previewNextMonthlySerial"),
      source.indexOf("export type BookingSerialBackfillRow"),
    );
    assert.match(previewBlock, /SELECT last_serial AS "lastSerial"/);
    assert.match(previewBlock, /LIMIT 1/);
    assert.doesNotMatch(previewBlock, /INSERT INTO booking_serial_counter/);
    assert.doesNotMatch(previewBlock, /ON CONFLICT/);
  });

  it("uses Asia/Kolkata month keys for allocation and backfill", () => {
    assert.match(source, /timeZone: "Asia\/Kolkata"/);
    assert.match(source, /AT TIME ZONE 'Asia\/Kolkata'/);
  });

  it("skips unlucky serial numbers 4 and 8 during allocation", () => {
    assert.match(source, /NOT IN \(4, 8\)/);
  });

  it("backfill script is idempotent and requires explicit --apply", () => {
    assert.match(backfillSource, /--dry-run/);
    assert.match(backfillSource, /--apply/);
    assert.match(backfillSource, /Pass --dry-run or --apply/);
    assert.match(source, /WHERE NOT EXISTS/);
    assert.match(source, /never updates existing counters or bookings/i);
  });

  it("create path uses allocateMonthlySerial inside the booking transaction", () => {
    const crud = readFileSync(
      join(process.cwd(), "src", "lib", "services", "bookingCrud.ts"),
      "utf8",
    );
    assert.match(crud, /allocateMonthlySerial\(tx, deliveryDate\)/);
    assert.match(crud, /previewNextMonthlySerial\(deliveryDateStr\)/);
    assert.doesNotMatch(crud, /getNextMonthlySerial/);
  });
});
