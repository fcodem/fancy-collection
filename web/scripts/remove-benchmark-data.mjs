/**
 * Remove all benchmark / test inventory and bookings (BENCH- prefix).
 *
 * Usage (from web/):
 *   node scripts/remove-benchmark-data.mjs
 *   node scripts/remove-benchmark-data.mjs --dry-run
 *
 * Does not touch owner user, real inventory, or real bookings.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");

const BENCH_SKU_PREFIX = "BENCH-";
const BENCH_BKG_PREFIX = "BENCH-";

async function countBenchmarkRows() {
  const [items, bookings, bookingItems, whatsappJobs] = await Promise.all([
    prisma.clothingItem.count({ where: { sku: { startsWith: BENCH_SKU_PREFIX } } }),
    prisma.booking.count({ where: { bookingNumber: { startsWith: BENCH_BKG_PREFIX } } }),
    prisma.bookingItem.count({ where: { item: { sku: { startsWith: BENCH_SKU_PREFIX } } } }),
    prisma.whatsAppJob.count({ where: { booking: { bookingNumber: { startsWith: BENCH_BKG_PREFIX } } } }),
  ]);
  return { items, bookings, bookingItems, whatsappJobs };
}

async function removeBenchmarkData() {
  const before = await countBenchmarkRows();
  console.log("Benchmark data found:");
  console.log(`  Items (BENCH- SKU):     ${before.items}`);
  console.log(`  Bookings (BENCH-*):     ${before.bookings}`);
  console.log(`  Booking items:          ${before.bookingItems}`);
  console.log(`  WhatsApp jobs:          ${before.whatsappJobs}`);

  if (before.items === 0 && before.bookings === 0) {
    console.log("\nNothing to remove.");
    return before;
  }

  if (dryRun) {
    console.log("\n--dry-run: no rows deleted.");
    return before;
  }

  console.log("\nRemoving benchmark bookings...");
  const deletedBookings = await prisma.booking.deleteMany({
    where: { bookingNumber: { startsWith: BENCH_BKG_PREFIX } },
  });
  console.log(`  Deleted ${deletedBookings.count} bookings`);

  console.log("Removing linked prospect lead items...");
  const deletedLeadItems = await prisma.prospectLeadItem.deleteMany({
    where: { item: { sku: { startsWith: BENCH_SKU_PREFIX } } },
  });
  console.log(`  Deleted ${deletedLeadItems.count} prospect lead items`);

  console.log("Removing linked rental items...");
  const deletedRentalItems = await prisma.rentalItem.deleteMany({
    where: { item: { sku: { startsWith: BENCH_SKU_PREFIX } } },
  });
  console.log(`  Deleted ${deletedRentalItems.count} rental items`);

  console.log("Removing benchmark inventory...");
  const deletedItems = await prisma.clothingItem.deleteMany({
    where: { sku: { startsWith: BENCH_SKU_PREFIX } },
  });
  console.log(`  Deleted ${deletedItems.count} items`);

  const after = await countBenchmarkRows();
  const owner = await prisma.user.findUnique({ where: { username: "owner" } });
  const [realItems, realBookings] = await Promise.all([
    prisma.clothingItem.count({ where: { NOT: { sku: { startsWith: BENCH_SKU_PREFIX } } } }),
    prisma.booking.count({ where: { NOT: { bookingNumber: { startsWith: BENCH_BKG_PREFIX } } } }),
  ]);

  console.log("\n=== Cleanup summary ===");
  console.log(`Remaining BENCH items:    ${after.items}`);
  console.log(`Remaining BENCH bookings: ${after.bookings}`);
  console.log(`Real inventory items:     ${realItems}`);
  console.log(`Real bookings:            ${realBookings}`);
  console.log(`Owner account intact:     ${owner ? `yes (${owner.username})` : "NO"}`);

  return { before, after, deletedBookings: deletedBookings.count, deletedItems: deletedItems.count };
}

removeBenchmarkData()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
