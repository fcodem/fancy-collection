/**
 * Add 10,000 more benchmark bookings (5001–15000) with intentional date overlaps.
 *
 * Usage (from web/):
 *   node scripts/seed-benchmark-bookings-extra.mjs
 *   node scripts/seed-benchmark-bookings-extra.mjs --reset-extra
 *
 * Requires base seed: node scripts/seed-benchmark-data.mjs
 * Does not touch owner user or BENCH- items.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const BENCH_SKU_PREFIX = "BENCH-";
const BENCH_BKG_PREFIX = "BENCH-BKG-";
const BENCH_MARKER = "benchmark-seed-v1";
const BENCH_EXTRA_MARKER = "benchmark-seed-extra-v1";

const BASE_BOOKINGS = 5000;
const EXTRA_BOOKINGS = 10000;
const TOTAL_BOOKINGS = BASE_BOOKINGS + EXTRA_BOOKINGS;
const BATCH = 250;
const MONTHLY_SERIAL_BASE = 70000;

/** Popular wedding / event dates (UTC) — many bookings cluster here. */
const POPULAR_DATES = [
  [2024, 10, 16], [2024, 10, 23], [2024, 11, 2], [2024, 11, 9], [2024, 11, 16],
  [2024, 11, 23], [2024, 11, 30], [2024, 12, 7], [2024, 12, 14], [2024, 12, 21],
  [2025, 1, 18], [2025, 2, 8], [2025, 2, 15], [2025, 3, 8], [2025, 3, 15],
  [2025, 4, 12], [2025, 4, 19], [2025, 5, 10], [2025, 5, 17], [2025, 6, 14],
  [2025, 10, 18], [2025, 10, 25], [2025, 11, 1], [2025, 11, 8], [2025, 11, 15],
  [2025, 11, 22], [2025, 11, 29], [2025, 12, 6], [2025, 12, 13], [2025, 12, 20],
  [2026, 1, 17], [2026, 2, 7], [2026, 2, 14], [2026, 3, 7], [2026, 3, 14],
  [2026, 4, 11], [2026, 4, 18], [2026, 5, 9], [2026, 5, 16], [2026, 6, 13],
  [2026, 10, 17], [2026, 11, 7], [2026, 11, 14], [2026, 11, 21], [2026, 12, 5],
  [2026, 12, 12], [2026, 12, 19], [2024, 9, 14], [2025, 9, 13], [2026, 9, 12],
];

const STATUS_PLAN = [
  ["returned", 4000],
  ["booked", 2000],
  ["delivered", 2000],
  ["cancelled", 1000],
  ["incomplete_return", 500],
  ["postponed", 500],
];

const args = new Set(process.argv.slice(2));
const resetExtra = args.has("--reset-extra");

function utcDate(y, m, d) {
  return new Date(Date.UTC(y, m, d));
}

function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function padBkg(n) {
  return `${BENCH_BKG_PREFIX}${String(n).padStart(6, "0")}`;
}

function buildStatusList() {
  const list = [];
  for (const [status, count] of STATUS_PLAN) {
    for (let i = 0; i < count; i++) list.push(status);
  }
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function bookingItemFlags(status, deliveryDate) {
  const delivered = status === "delivered" || status === "returned" || status === "incomplete_return";
  const returned = status === "returned";
  const incomplete = status === "incomplete_return";
  return {
    isDelivered: delivered,
    deliveredAt: delivered ? addDays(deliveryDate, 1) : null,
    isReturned: returned,
    isIncompleteReturn: incomplete,
    itemIncompleteNotes: incomplete ? "Benchmark incomplete return (extra)" : null,
    isPackedReady: status === "booked" || delivered,
  };
}

function bookingExtras(status, deliveryDate, returnDate) {
  const flags = {
    deliveredAt: null,
    returnedAt: null,
    postponedAt: null,
    incompleteNotes: null,
    securityHeld: 0,
  };
  if (status === "delivered") flags.deliveredAt = addDays(deliveryDate, 1);
  if (status === "returned") {
    flags.deliveredAt = addDays(deliveryDate, 1);
    flags.returnedAt = addDays(returnDate, 1);
  }
  if (status === "incomplete_return") {
    flags.deliveredAt = addDays(deliveryDate, 1);
    flags.incompleteNotes = "Benchmark incomplete return (extra)";
    flags.securityHeld = 500;
  }
  if (status === "postponed") flags.postponedAt = addDays(deliveryDate, -2);
  return flags;
}

/** Pre-build overlap clusters: same item + same delivery/return window. */
function buildOverlapClusters(items) {
  const clusters = [];
  const overlapItemCount = Math.min(250, items.length);
  for (let c = 0; c < overlapItemCount; c++) {
    const item = items[c % items.length];
    const pop = POPULAR_DATES[c % POPULAR_DATES.length];
    const deliveryDate = utcDate(pop[0], pop[1], pop[2]);
    const returnDate = addDays(deliveryDate, 2 + (c % 3));
    const depth = 3 + (c % 6);
    for (let k = 0; k < depth; k++) {
      clusters.push({ item, deliveryDate, returnDate, clusterId: c });
    }
  }
  return clusters;
}

async function resetExtraBookings() {
  const extra = await prisma.booking.findMany({
    where: { bookingNumber: { gte: padBkg(BASE_BOOKINGS + 1) } },
    select: { id: true },
  });
  if (extra.length) {
    await prisma.bookingItem.deleteMany({ where: { bookingId: { in: extra.map((b) => b.id) } } });
    await prisma.booking.deleteMany({ where: { id: { in: extra.map((b) => b.id) } } });
  }
  console.log(`  Removed ${extra.length} extra benchmark bookings`);
}

async function ensurePrerequisites() {
  const items = await prisma.clothingItem.count({ where: { sku: { startsWith: BENCH_SKU_PREFIX } } });
  const base = await prisma.booking.count({
    where: {
      bookingNumber: { startsWith: BENCH_BKG_PREFIX, lte: padBkg(BASE_BOOKINGS) },
    },
  });
  if (!items) {
    console.error("No BENCH- items. Run: node scripts/seed-benchmark-data.mjs");
    process.exit(1);
  }
  if (base < BASE_BOOKINGS) {
    console.error(`Expected ${BASE_BOOKINGS} base bookings, found ${base}. Run base seed first.`);
    process.exit(1);
  }
}

async function ensureNotAlreadySeeded() {
  const existing = await prisma.booking.count({
    where: { bookingNumber: { gte: padBkg(BASE_BOOKINGS + 1) } },
  });
  if (existing > 0) {
    console.error(`Found ${existing} extra bookings. Re-run with --reset-extra.`);
    process.exit(1);
  }
}

async function countOverlapPairs() {
  const rows = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS cnt
    FROM bookings b1
    JOIN booking_items bi1 ON bi1.booking_id = b1.id
    JOIN bookings b2 ON b2.id > b1.id
    JOIN booking_items bi2 ON bi2.booking_id = b2.id AND bi2.item_id = bi1.item_id
    WHERE b1.booking_number LIKE 'BENCH-BKG-%'
      AND b2.booking_number LIKE 'BENCH-BKG-%'
      AND b1.status IN ('booked', 'delivered')
      AND b2.status IN ('booked', 'delivered')
      AND b1.delivery_date < (b2.return_date + INTERVAL '1 day')
      AND b1.return_date >= b2.delivery_date
  `;
  return rows[0]?.cnt ?? 0;
}

async function seedExtraBookings(items, statuses, clusters) {
  const bookingRows = [];
  let overlapAssignments = 0;

  for (let i = 0; i < EXTRA_BOOKINGS; i++) {
    const globalIdx = BASE_BOOKINGS + i;
    const seqNum = globalIdx + 1;
    const status = statuses[i];

    let item;
    let deliveryDate;
    let returnDate;
    let overlapClusterId = null;

    if (i < clusters.length && (status === "booked" || status === "delivered")) {
      const cluster = clusters[i];
      item = cluster.item;
      deliveryDate = cluster.deliveryDate;
      returnDate = cluster.returnDate;
      overlapClusterId = cluster.clusterId;
      overlapAssignments++;
    } else if (i % 7 === 0) {
      const pop = POPULAR_DATES[i % POPULAR_DATES.length];
      item = items[i % items.length];
      deliveryDate = utcDate(pop[0], pop[1], pop[2]);
      returnDate = addDays(deliveryDate, 2 + (i % 4));
    } else {
      const itemIdx = (globalIdx * 7 + Math.floor(i / 13)) % items.length;
      item = items[itemIdx];
      const seq = Math.floor(globalIdx / items.length);
      deliveryDate = addDays(utcDate(2023, 0, 1), seq * 90 + (globalIdx % 17));
      returnDate = addDays(deliveryDate, 2 + (globalIdx % 5));
    }

    const price = item.dailyRate * 3;
    const advance = Math.round(price * 0.4);
    const remaining = price - advance;
    const extras = bookingExtras(status, deliveryDate, returnDate);

    bookingRows.push({
      bookingNumber: padBkg(seqNum),
      monthlySerial: MONTHLY_SERIAL_BASE + seqNum,
      customerName: `Bench Customer ${String((globalIdx % 300) + 1).padStart(3, "0")}`,
      customerAddress: `${200 + (globalIdx % 80)} Benchmark Street, Test City`,
      contact1: `97${String(10000000 + (globalIdx % 90000000)).slice(0, 8)}`,
      whatsappNo: `97${String(30000000 + (globalIdx % 70000000)).slice(0, 8)}`,
      deliveryDate,
      deliveryTime: globalIdx % 2 === 0 ? "10:00" : "14:00",
      returnDate,
      returnTime: globalIdx % 2 === 0 ? "18:00" : "12:00",
      venue: globalIdx % 5 === 0 ? `Venue ${(globalIdx % 30) + 1}` : null,
      securityDeposit: item.deposit,
      totalPrice: price,
      totalAdvance: advance,
      totalRemaining: remaining,
      advancePaymentMode: globalIdx % 3 === 0 ? "online" : "cash",
      commonNotes: overlapClusterId != null ? BENCH_EXTRA_MARKER : BENCH_MARKER,
      staffNames: globalIdx % 4 === 0 ? "Bench Staff" : null,
      status,
      itemId: item.id,
      dressName: item.name,
      price,
      advance,
      remaining,
      publicBookingId: `BENCH-PB-${String(seqNum).padStart(6, "0")}`,
      ...extras,
      _item: item,
      _flags: bookingItemFlags(status, deliveryDate),
    });
  }

  let created = 0;
  for (let i = 0; i < bookingRows.length; i += BATCH) {
    const chunk = bookingRows.slice(i, i + BATCH);
    const ids = await prisma.$transaction(
      chunk.map((row) => {
        const { _item, _flags, ...data } = row;
        return prisma.booking.create({
          data: {
            ...data,
            bookingItems: {
              create: {
                itemId: _item.id,
                dressName: _item.name,
                category: _item.category,
                size: _item.size || "",
                price: data.price,
                advance: data.advance,
                remaining: data.remaining,
                notes: data.commonNotes,
                ..._flags,
              },
            },
          },
          select: { id: true },
        });
      }),
    );
    created += ids.length;
    if ((i + BATCH) % 1000 === 0 || i + BATCH >= bookingRows.length) {
      console.log(`  ... ${created}/${EXTRA_BOOKINGS} extra bookings`);
    }
  }

  return { created, overlapAssignments, clusterCount: new Set(clusters.map((c) => c.clusterId)).size };
}

async function syncItemStatus() {
  await prisma.clothingItem.updateMany({
    where: { sku: { startsWith: BENCH_SKU_PREFIX } },
    data: { status: "available" },
  });

  const todayStart = utcDate(
    new Date().getUTCFullYear(),
    new Date().getUTCMonth(),
    new Date().getUTCDate(),
  );
  const todayEnd = addDays(todayStart, 1);

  const activeBookings = await prisma.booking.findMany({
    where: {
      bookingNumber: { startsWith: BENCH_BKG_PREFIX },
      status: { in: ["booked", "delivered"] },
      deliveryDate: { lt: todayEnd },
      returnDate: { gte: todayStart },
    },
    include: { bookingItems: { select: { itemId: true } } },
  });

  const rentedIds = [...new Set(activeBookings.flatMap((b) => b.bookingItems.map((bi) => bi.itemId)))];
  if (rentedIds.length) {
    await prisma.clothingItem.updateMany({
      where: { id: { in: rentedIds } },
      data: { status: "rented" },
    });
  }
}

async function printSummary(seedStats) {
  const statusCounts = await prisma.booking.groupBy({
    by: ["status"],
    where: { bookingNumber: { startsWith: BENCH_BKG_PREFIX } },
    _count: { id: true },
    orderBy: { status: "asc" },
  });

  const totalBookings = await prisma.booking.count({
    where: { bookingNumber: { startsWith: BENCH_BKG_PREFIX } },
  });
  const overlapPairs = await countOverlapPairs();
  const owner = await prisma.user.findUnique({ where: { username: "owner" } });

  console.log("\n=== Extra benchmark seed summary ===");
  console.log(`Total BENCH bookings: ${totalBookings} (target ${TOTAL_BOOKINGS})`);
  console.log(`Overlap clusters: ${seedStats.clusterCount}`);
  console.log(`Overlap slot assignments (booked/delivered): ${seedStats.overlapAssignments}`);
  console.log(`Active overlap pairs (same item, intersecting dates): ${overlapPairs}`);
  console.log(`Owner user intact: ${owner ? `yes (${owner.username})` : "NO"}`);
  console.log("\nBookings by status (all BENCH):");
  for (const row of statusCounts) {
    console.log(`  ${row.status}: ${row._count.id}`);
  }

  return { totalBookings, overlapPairs, statusCounts, ownerOk: !!owner };
}

async function main() {
  const started = Date.now();
  console.log("Extra benchmark bookings seed starting...");

  if (resetExtra) {
    await resetExtraBookings();
  } else {
    await ensurePrerequisites();
    await ensureNotAlreadySeeded();
  }

  const items = await prisma.clothingItem.findMany({
    where: { sku: { startsWith: BENCH_SKU_PREFIX } },
    orderBy: { id: "asc" },
    select: { id: true, name: true, category: true, size: true, dailyRate: true, deposit: true },
  });

  const statuses = buildStatusList();
  if (statuses.length !== EXTRA_BOOKINGS) {
    throw new Error(`Status plan must sum to ${EXTRA_BOOKINGS}`);
  }

  const clusters = buildOverlapClusters(items);
  console.log(`Overlap clusters prepared: ${new Set(clusters.map((c) => c.clusterId)).size} (${clusters.length} slots)`);

  const t0 = Date.now();
  const seedStats = await seedExtraBookings(items, statuses, clusters);
  console.log(`  Extra bookings seeded in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  await syncItemStatus();
  const summary = await printSummary(seedStats);
  console.log(`\nDone in ${((Date.now() - started) / 1000).toFixed(1)}s`);

  return summary;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
