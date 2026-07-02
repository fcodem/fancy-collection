/**
 * Benchmark seed: 1000 inventory items (even across categories) + 5000 bookings.
 *
 * Usage (from web/):
 *   node scripts/seed-benchmark-data.mjs
 *   node scripts/seed-benchmark-data.mjs --reset
 *
 * Benchmark rows are prefixed BENCH- (SKU / booking_number). Does not touch owner user.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const BENCH_SKU_PREFIX = "BENCH-";
const BENCH_BKG_PREFIX = "BENCH-BKG-";
const BENCH_MARKER = "benchmark-seed-v1";

const BASE_MENS = ["Sherwani", "Indowestern", "Jodhpuri", "Coat Suit", "Suit", "Blazer", "Kurta"];
const BASE_WOMENS = ["Saree", "Lehenga", "Gown"];
const BASE_JEWELLERY = [
  "Jewellery", "Necklace", "Bangles", "Earrings", "Maang Tikka",
  "Haath Phool", "Anklet", "Nose Ring", "Matha Patti",
];
const BASE_ACCESSORY = ["Accessory", "Dupatta", "Belt", "Clutch", "Crown/Tiara"];
const JEWELLERY_SET = new Set(BASE_JEWELLERY);
const ACCESSORY_SET = new Set(BASE_ACCESSORY);
const SIZES = [...Array.from({ length: 14 }, (_, i) => String(32 + i * 2)), "Free Size", "Custom"];
const COLORS = ["Red", "Blue", "Gold", "Green", "Pink", "Maroon", "Ivory", "Black", "Silver", "Purple"];

const TARGET_ITEMS = 1000;
const TARGET_BOOKINGS = 5000;
const BATCH = 250;

const STATUS_PLAN = [
  ["returned", 2000],
  ["booked", 1000],
  ["delivered", 1000],
  ["cancelled", 500],
  ["incomplete_return", 250],
  ["postponed", 250],
];

const args = new Set(process.argv.slice(2));
const shouldReset = args.has("--reset");

function utcDate(y, m, d) {
  return new Date(Date.UTC(y, m, d));
}

function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function itemTypeForCategory(category) {
  if (JEWELLERY_SET.has(category)) return "jewellery";
  if (ACCESSORY_SET.has(category)) return "accessory";
  return "clothing";
}

function slugCategory(category) {
  return category.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toUpperCase();
}

async function loadCategories() {
  const hidden = await prisma.hiddenCategory.findMany().catch(() => []);
  const hiddenSet = new Set(hidden.map((h) => h.name));
  const custom = await prisma.customCategory.findMany({ where: { active: true } }).catch(() => []);

  const base = [...BASE_MENS, ...BASE_WOMENS, ...BASE_JEWELLERY, ...BASE_ACCESSORY].filter(
    (n) => !hiddenSet.has(n),
  );
  const customNames = custom.map((c) => c.name).filter((n) => !hiddenSet.has(n) && !base.includes(n));
  const all = [...base, ...customNames];
  if (!all.length) throw new Error("No categories available for benchmark seed.");
  return all;
}

function distributeCounts(categories, total) {
  const base = Math.floor(total / categories.length);
  const remainder = total % categories.length;
  return categories.map((category, i) => ({
    category,
    count: base + (i < remainder ? 1 : 0),
  }));
}

function buildStatusList() {
  const list = [];
  for (const [status, count] of STATUS_PLAN) {
    for (let i = 0; i < count; i++) list.push(status);
  }
  // Fisher–Yates shuffle
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function bookingItemFlags(status, deliveryDate, returnDate) {
  const now = Date.now();
  const delivered = status === "delivered" || status === "returned" || status === "incomplete_return";
  const returned = status === "returned";
  const incomplete = status === "incomplete_return";
  const deliveredAt = delivered ? addDays(deliveryDate, 1) : null;
  return {
    isDelivered: delivered,
    deliveredAt,
    isReturned: returned,
    isIncompleteReturn: incomplete,
    itemIncompleteNotes: incomplete ? "Benchmark incomplete return" : null,
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
  if (status === "delivered") {
    flags.deliveredAt = addDays(deliveryDate, 1);
  }
  if (status === "returned") {
    flags.deliveredAt = addDays(deliveryDate, 1);
    flags.returnedAt = addDays(returnDate, 1);
  }
  if (status === "incomplete_return") {
    flags.deliveredAt = addDays(deliveryDate, 1);
    flags.incompleteNotes = "Benchmark incomplete return";
    flags.securityHeld = 500;
  }
  if (status === "postponed") {
    flags.postponedAt = addDays(deliveryDate, -2);
  }
  return flags;
}

async function resetBenchmarkData() {
  console.log("Resetting benchmark data (BENCH- prefix)...");
  const benchBookings = await prisma.booking.findMany({
    where: { bookingNumber: { startsWith: BENCH_BKG_PREFIX } },
    select: { id: true },
  });
  if (benchBookings.length) {
    await prisma.bookingItem.deleteMany({
      where: { bookingId: { in: benchBookings.map((b) => b.id) } },
    });
    await prisma.booking.deleteMany({
      where: { id: { in: benchBookings.map((b) => b.id) } },
    });
  }
  const deletedItems = await prisma.clothingItem.deleteMany({
    where: { sku: { startsWith: BENCH_SKU_PREFIX } },
  });
  console.log(`  Removed ${benchBookings.length} bookings, ${deletedItems.count} items`);
}

async function ensureNotAlreadySeeded() {
  const existing = await prisma.clothingItem.count({
    where: { sku: { startsWith: BENCH_SKU_PREFIX } },
  });
  if (existing > 0) {
    console.error(
      `Found ${existing} benchmark items. Re-run with --reset to replace, or delete BENCH- rows manually.`,
    );
    process.exit(1);
  }
}

async function seedItems(categories) {
  const plan = distributeCounts(categories, TARGET_ITEMS);
  const rows = [];
  let seq = 1;
  for (const { category, count } of plan) {
    const slug = slugCategory(category);
    for (let i = 0; i < count; i++) {
      rows.push({
        name: `BENCH ${category} ${String(i + 1).padStart(3, "0")}`,
        sku: `${BENCH_SKU_PREFIX}${slug}-${String(seq).padStart(5, "0")}`,
        category,
        size: SIZES[seq % SIZES.length],
        color: COLORS[seq % COLORS.length],
        dailyRate: 500 + (seq % 20) * 100,
        deposit: 2000 + (seq % 10) * 500,
        status: "available",
        itemType: itemTypeForCategory(category),
        conditionNotes: BENCH_MARKER,
        subCategory: seq % 3 === 0 ? "Premium" : seq % 3 === 1 ? "Normal" : "Cheap",
      });
      seq++;
    }
  }

  for (let i = 0; i < rows.length; i += BATCH) {
    await prisma.clothingItem.createMany({ data: rows.slice(i, i + BATCH) });
  }

  const items = await prisma.clothingItem.findMany({
    where: { sku: { startsWith: BENCH_SKU_PREFIX } },
    orderBy: { id: "asc" },
    select: { id: true, name: true, category: true, size: true, dailyRate: true, deposit: true },
  });
  console.log(`  Created ${items.length} clothing items`);
  return { items, perCategory: plan };
}

async function seedBookings(items, statuses) {
  const bookingRows = [];

  for (let i = 0; i < TARGET_BOOKINGS; i++) {
    const item = items[i % items.length];
    const seq = Math.floor(i / items.length);
    const deliveryDate = addDays(utcDate(2022, 0, 1), seq * 180 + (i % items.length));
    const returnDate = addDays(deliveryDate, 2 + (i % 4));
    const status = statuses[i];
    const price = item.dailyRate * 3;
    const advance = Math.round(price * 0.4);
    const remaining = price - advance;
    const extras = bookingExtras(status, deliveryDate, returnDate);
    const monthlySerial = 70000 + i + 1;

    bookingRows.push({
      bookingNumber: `${BENCH_BKG_PREFIX}${String(i + 1).padStart(6, "0")}`,
      monthlySerial,
      customerName: `Bench Customer ${String((i % 200) + 1).padStart(3, "0")}`,
      customerAddress: `${100 + (i % 50)} Benchmark Street, Test City`,
      contact1: `98${String(10000000 + (i % 90000000)).slice(0, 8)}`,
      whatsappNo: `98${String(20000000 + (i % 80000000)).slice(0, 8)}`,
      deliveryDate,
      deliveryTime: i % 2 === 0 ? "10:00" : "14:00",
      returnDate,
      returnTime: i % 2 === 0 ? "18:00" : "12:00",
      venue: i % 5 === 0 ? `Venue ${(i % 20) + 1}` : null,
      securityDeposit: item.deposit,
      totalPrice: price,
      totalAdvance: advance,
      totalRemaining: remaining,
      advancePaymentMode: i % 3 === 0 ? "online" : "cash",
      commonNotes: BENCH_MARKER,
      staffNames: i % 4 === 0 ? "Bench Staff" : null,
      status,
      itemId: item.id,
      dressName: item.name,
      price,
      advance,
      remaining,
      publicBookingId: `BENCH-PB-${String(i + 1).padStart(6, "0")}`,
      ...extras,
      _item: item,
      _flags: bookingItemFlags(status, deliveryDate, returnDate),
    });
  }

  const createdBookings = [];
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
                notes: BENCH_MARKER,
                ..._flags,
              },
            },
          },
          select: { id: true, status: true, bookingNumber: true },
        });
      }),
    );
    createdBookings.push(...ids);
  }

  console.log(`  Created ${createdBookings.length} bookings with items`);

  // Sync clothing item status from latest overlapping active bench bookings
  await prisma.clothingItem.updateMany({
    where: { sku: { startsWith: BENCH_SKU_PREFIX } },
    data: { status: "available" },
  });

  const todayStart = utcDate(
    new Date().getFullYear(),
    new Date().getMonth(),
    new Date().getDate(),
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

  return createdBookings;
}

async function printSummary(perCategory) {
  const itemCounts = await prisma.clothingItem.groupBy({
    by: ["category"],
    where: { sku: { startsWith: BENCH_SKU_PREFIX } },
    _count: { id: true },
    orderBy: { category: "asc" },
  });

  const statusCounts = await prisma.booking.groupBy({
    by: ["status"],
    where: { bookingNumber: { startsWith: BENCH_BKG_PREFIX } },
    _count: { id: true },
    orderBy: { status: "asc" },
  });

  const totalItems = await prisma.clothingItem.count({
    where: { sku: { startsWith: BENCH_SKU_PREFIX } },
  });
  const totalBookings = await prisma.booking.count({
    where: { bookingNumber: { startsWith: BENCH_BKG_PREFIX } },
  });
  const totalBookingItems = await prisma.bookingItem.count({
    where: { notes: BENCH_MARKER },
  });

  const owner = await prisma.user.findUnique({ where: { username: "owner" } });

  console.log("\n=== Benchmark seed summary ===");
  console.log(`Items: ${totalItems} | Bookings: ${totalBookings} | Booking items: ${totalBookingItems}`);
  console.log(`Owner user intact: ${owner ? `yes (${owner.username}, role=${owner.role})` : "NO — missing!"}`);
  console.log("\nItems per category:");
  for (const row of itemCounts) {
    console.log(`  ${row.category}: ${row._count.id}`);
  }
  console.log("\nBookings by status:");
  for (const row of statusCounts) {
    console.log(`  ${row.status}: ${row._count.id}`);
  }
}

async function main() {
  const started = Date.now();
  console.log("Benchmark seed starting...");

  if (shouldReset) {
    await resetBenchmarkData();
  } else {
    await ensureNotAlreadySeeded();
  }

  const categories = await loadCategories();
  console.log(`Categories (${categories.length}): ${categories.join(", ")}`);

  const statuses = buildStatusList();
  if (statuses.length !== TARGET_BOOKINGS) {
    throw new Error(`Status plan must sum to ${TARGET_BOOKINGS}`);
  }

  const t0 = Date.now();
  const { items, perCategory } = await seedItems(categories);
  console.log(`  Items seeded in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const t1 = Date.now();
  await seedBookings(items, statuses);
  console.log(`  Bookings seeded in ${((Date.now() - t1) / 1000).toFixed(1)}s`);

  await printSummary(perCategory);
  console.log(`\nDone in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
