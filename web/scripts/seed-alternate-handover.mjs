/**
 * Seed alternate handover pairs for Alternate Booking list testing.
 * Same dress: returning from booking A + delivering to booking B on the same date.
 *
 * Usage (from web/):
 *   node scripts/seed-alternate-handover.mjs
 *   node scripts/seed-alternate-handover.mjs --reset
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BENCH_SKU_PREFIX = "BENCH-";
const BENCH_BKG_PREFIX = "BENCH-BKG-";
const BENCH_MARKER = "benchmark-seed-v1";
const ALT_MARKER = "benchmark-alternate-v1";
const ALT_BKG_PREFIX = "BENCH-ALT-";
const PAIRS_PER_DATE = 50;

const HOT_DATES = ["2026-06-15", "2026-07-01", "2026-08-10"];

const shouldReset = process.argv.includes("--reset");

function utcDate(y, m, d) {
  return new Date(Date.UTC(y, m, d));
}

function parseIso(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return utcDate(y, m - 1, d);
}

async function resetAlternateData() {
  const rows = await prisma.booking.findMany({
    where: { bookingNumber: { startsWith: ALT_BKG_PREFIX } },
    select: { id: true },
  });
  if (rows.length) {
    await prisma.bookingItem.deleteMany({ where: { bookingId: { in: rows.map((r) => r.id) } } });
    await prisma.booking.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
  }
  console.log(`  Removed ${rows.length} alternate benchmark bookings`);
}

async function maxMonthlySerial() {
  const row = await prisma.booking.findFirst({
    orderBy: { monthlySerial: "desc" },
    select: { monthlySerial: true },
  });
  return row?.monthlySerial ?? 70000;
}

async function main() {
  if (shouldReset) await resetAlternateData();

  const existing = await prisma.booking.count({
    where: { bookingNumber: { startsWith: ALT_BKG_PREFIX } },
  });
  if (existing > 0) {
    console.log(`Found ${existing} alternate bookings. Use --reset to replace.`);
    process.exit(0);
  }

  const items = await prisma.clothingItem.findMany({
    where: { sku: { startsWith: BENCH_SKU_PREFIX } },
    orderBy: { id: "asc" },
    take: HOT_DATES.length * PAIRS_PER_DATE,
    select: { id: true, name: true, category: true, size: true, dailyRate: true, deposit: true },
  });
  if (items.length < PAIRS_PER_DATE) {
    console.error("Need benchmark items first. Run: node scripts/seed-benchmark-data.mjs");
    process.exit(1);
  }

  let serial = (await maxMonthlySerial()) + 1;
  let seq = 1;
  const created = [];

  for (const dateIso of HOT_DATES) {
    const handoverDate = parseIso(dateIso);
    const returnSideDelivery = utcDate(handoverDate.getUTCFullYear(), handoverDate.getUTCMonth(), handoverDate.getUTCDate() - 3);
    const nextSideReturn = utcDate(handoverDate.getUTCFullYear(), handoverDate.getUTCMonth(), handoverDate.getUTCDate() + 3);

    for (let p = 0; p < PAIRS_PER_DATE; p++) {
      const item = items[(HOT_DATES.indexOf(dateIso) * PAIRS_PER_DATE + p) % items.length];
      const price = item.dailyRate * 3;
      const advance = Math.round(price * 0.4);
      const remaining = price - advance;

      const returning = await prisma.booking.create({
        data: {
          bookingNumber: `${ALT_BKG_PREFIX}RET-${dateIso.replace(/-/g, "")}-${String(p + 1).padStart(3, "0")}`,
          monthlySerial: serial++,
          customerName: `Alt Return ${dateIso} #${p + 1}`,
          customerAddress: "Alternate Benchmark St",
          contact1: `971${String(1000000 + seq).slice(-7)}`,
          whatsappNo: `972${String(1000000 + seq).slice(-7)}`,
          deliveryDate: returnSideDelivery,
          deliveryTime: "10:00",
          returnDate: handoverDate,
          returnTime: "11:00",
          securityDeposit: item.deposit,
          totalPrice: price,
          totalAdvance: advance,
          totalRemaining: remaining,
          commonNotes: ALT_MARKER,
          status: "delivered",
          deliveredAt: returnSideDelivery,
          itemId: item.id,
          dressName: item.name,
          price,
          advance,
          remaining,
          publicBookingId: `ALT-RET-${String(seq).padStart(5, "0")}`,
          bookingItems: {
            create: {
              itemId: item.id,
              dressName: item.name,
              category: item.category,
              size: item.size || "",
              price,
              advance,
              remaining,
              notes: ALT_MARKER,
              isDelivered: true,
              deliveredAt: returnSideDelivery,
              isReturned: false,
              isPackedReady: true,
            },
          },
        },
        select: { id: true, bookingNumber: true },
      });

      const delivering = await prisma.booking.create({
        data: {
          bookingNumber: `${ALT_BKG_PREFIX}DEL-${dateIso.replace(/-/g, "")}-${String(p + 1).padStart(3, "0")}`,
          monthlySerial: serial++,
          customerName: `Alt Deliver ${dateIso} #${p + 1}`,
          customerAddress: "Alternate Benchmark St",
          contact1: `973${String(1000000 + seq).slice(-7)}`,
          whatsappNo: `974${String(1000000 + seq).slice(-7)}`,
          deliveryDate: handoverDate,
          deliveryTime: "12:00",
          returnDate: nextSideReturn,
          returnTime: "18:00",
          securityDeposit: item.deposit,
          totalPrice: price,
          totalAdvance: advance,
          totalRemaining: remaining,
          commonNotes: ALT_MARKER,
          status: "booked",
          itemId: item.id,
          dressName: item.name,
          price,
          advance,
          remaining,
          publicBookingId: `ALT-DEL-${String(seq).padStart(5, "0")}`,
          bookingItems: {
            create: {
              itemId: item.id,
              dressName: item.name,
              category: item.category,
              size: item.size || "",
              price,
              advance,
              remaining,
              notes: ALT_MARKER,
              isDelivered: false,
              isReturned: false,
              isPackedReady: true,
            },
          },
        },
        select: { id: true, bookingNumber: true },
      });

      created.push({ date: dateIso, returning: returning.bookingNumber, delivering: delivering.bookingNumber, item: item.name });
      seq++;
    }
    console.log(`  ${dateIso}: ${PAIRS_PER_DATE} alternate pairs`);
  }

  console.log(`\nCreated ${created.length} alternate handover pairs (${created.length / HOT_DATES.length} per hot date)`);
  console.log(`Test: GET /api/returning-today?date=2026-06-15 (expect ~${PAIRS_PER_DATE} rows with next_booking)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
