import { Prisma } from "@prisma/client";
import prisma from "./prisma";
import { nextValidSerial } from "./serial";

type RawClient = {
  $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T>;
};

/** Canonical booking month in Asia/Kolkata. */
export function deliveryYearMonthKey(value: Date | string): string {
  if (typeof value === "string") {
    const normalized = value.trim();
    if (!/^\d{4}-\d{2}(?:-\d{2})?$/.test(normalized)) {
      throw new Error("Invalid booking date.");
    }
    return normalized.slice(0, 7);
  }
  if (Number.isNaN(value.getTime())) throw new Error("Invalid booking date.");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(value);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  if (!year || !month) throw new Error("Invalid booking date.");
  return `${year}-${month}`;
}

/**
 * Authoritative serial allocation inside a booking create transaction.
 * Uses INSERT ... ON CONFLICT DO UPDATE ... RETURNING (no bookings-table scan).
 */
export async function allocateMonthlySerial(
  client: RawClient,
  bookingDate: Date | string,
): Promise<number> {
  const yearMonth = deliveryYearMonthKey(bookingDate);
  const rows = await client.$queryRaw<Array<{ lastSerial: number }>>(Prisma.sql`
    INSERT INTO booking_serial_counter (year_month, last_serial, updated_at)
    VALUES (${yearMonth}, 1, NOW())
    ON CONFLICT (year_month)
    DO UPDATE SET
      last_serial = (
        SELECT candidate::integer
        FROM generate_series(
          booking_serial_counter.last_serial + 1,
          booking_serial_counter.last_serial + 100
        ) AS candidate
        WHERE (
          SELECT COALESCE(SUM(digit::integer), 0)
          FROM regexp_split_to_table(candidate::text, '') AS digit
        ) NOT IN (4, 8)
        ORDER BY candidate
        LIMIT 1
      ),
      updated_at = NOW()
    RETURNING last_serial AS "lastSerial"
  `);
  const serial = rows[0]?.lastSerial;
  if (!serial) throw new Error("Failed to allocate monthly booking serial.");
  return serial;
}

/** Read-only estimate for the booking form — never reserves a serial. */
export async function previewNextMonthlySerial(
  bookingDate: Date | string,
  client: RawClient = prisma,
): Promise<number> {
  const yearMonth = deliveryYearMonthKey(bookingDate);
  const rows = await client.$queryRaw<Array<{ lastSerial: number }>>(Prisma.sql`
    SELECT last_serial AS "lastSerial"
    FROM booking_serial_counter
    WHERE year_month = ${yearMonth}
    LIMIT 1
  `);
  return rows[0] ? nextValidSerial(rows[0].lastSerial + 1) : 1;
}

export type BookingSerialBackfillRow = {
  yearMonth: string;
  historicalMax: number;
  counterValue: number | null;
};

/** Historical max per month for backfill dry-run / apply planning. */
export async function inspectBookingSerialBackfill(
  client: RawClient = prisma,
): Promise<BookingSerialBackfillRow[]> {
  return client.$queryRaw<BookingSerialBackfillRow[]>(Prisma.sql`
    WITH historical AS (
      SELECT
        to_char(delivery_date AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM') AS year_month,
        MAX(monthly_serial)::integer AS historical_max
      FROM bookings
      GROUP BY 1
    )
    SELECT
      historical.year_month AS "yearMonth",
      historical.historical_max AS "historicalMax",
      counter.last_serial AS "counterValue"
    FROM historical
    LEFT JOIN booking_serial_counter counter
      ON counter.year_month = historical.year_month
    ORDER BY historical.year_month
  `);
}

/** Insert missing counter rows only — never updates existing counters or bookings. */
export async function applyBookingSerialBackfill(
  client: RawClient = prisma,
): Promise<Array<{ yearMonth: string; lastSerial: number }>> {
  return client.$queryRaw<Array<{ yearMonth: string; lastSerial: number }>>(Prisma.sql`
    WITH historical AS (
      SELECT
        to_char(delivery_date AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM') AS year_month,
        MAX(monthly_serial)::integer AS historical_max
      FROM bookings
      GROUP BY 1
    )
    INSERT INTO booking_serial_counter (year_month, last_serial, updated_at)
    SELECT year_month, historical_max, NOW()
    FROM historical
    WHERE NOT EXISTS (
      SELECT 1 FROM booking_serial_counter existing
      WHERE existing.year_month = historical.year_month
    )
    RETURNING year_month AS "yearMonth", last_serial AS "lastSerial"
  `);
}
