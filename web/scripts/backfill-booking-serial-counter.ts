/**
 * Idempotent backfill for booking_serial_counter from existing bookings.
 *
 * Usage:
 *   npm run backfill:booking-serial-counter -- --dry-run
 *   npm run backfill:booking-serial-counter -- --apply
 *
 * Only inserts missing year_month rows. Never updates existing counters or bookings.
 */
import prisma from "../src/lib/prisma";
import {
  applyBookingSerialBackfill,
  inspectBookingSerialBackfill,
} from "../src/lib/bookingSerialCounter";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const apply = process.argv.includes("--apply");

  if (!dryRun && !apply) {
    console.error("[booking-serial-counter] Pass --dry-run or --apply");
    process.exit(1);
  }

  const rows = await inspectBookingSerialBackfill();
  const missing = rows.filter((row) => row.counterValue == null);

  console.log(
    `[booking-serial-counter] months in bookings=${rows.length} missing counters=${missing.length}`,
  );

  for (const row of missing) {
    console.log(
      `[booking-serial-counter] would init ${row.yearMonth} last_serial=${row.historicalMax}`,
    );
  }

  if (dryRun) {
    console.log("[booking-serial-counter] --dry-run: no writes performed.");
    return;
  }

  if (!missing.length) {
    console.log("[booking-serial-counter] nothing to insert.");
    return;
  }

  const inserted = await applyBookingSerialBackfill();
  console.log(`[booking-serial-counter] inserted=${inserted.length}`);
  for (const row of inserted) {
    console.log(`  ${row.yearMonth} -> ${row.lastSerial}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[booking-serial-counter] failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
