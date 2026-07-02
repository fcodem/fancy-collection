/**
 * Exercise read-path services after benchmark seed (no HTTP / session required).
 *
 * Usage: npx tsx scripts/test-benchmark-data.ts
 */
import prisma from "../src/lib/prisma";
import { todayIso, monthStartIso } from "../src/lib/constants";
import { getBookingListData } from "../src/lib/services/bookingList";
import { getAvailableItemsApi } from "../src/lib/booking";
import {
  monthBasedSearchBookings,
  universalSearchBookings,
  dashboardSearchBookings,
} from "../src/lib/services/bookingSearchCore";
import { getManagedCategoryGroups } from "../src/lib/services/adminOps";
import { getReturningToday } from "../src/lib/services/operations";
import { getDashboardStatList } from "../src/lib/services/dashboardStatLists";

type Result = { name: string; ok: boolean; ms: number; detail?: string };

const results: Result[] = [];

async function run(name: string, fn: () => Promise<void>) {
  const t0 = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - t0 });
  } catch (e) {
    results.push({
      name,
      ok: false,
      ms: Date.now() - t0,
      detail: e instanceof Error ? e.message : String(e),
    });
  }
}

async function main() {
  const benchItems = await prisma.clothingItem.count({
    where: { sku: { startsWith: "BENCH-" } },
  });
  const benchBookings = await prisma.booking.count({
    where: { bookingNumber: { startsWith: "BENCH-BKG-" } },
  });

  if (!benchItems || !benchBookings) {
    console.error("No benchmark data found. Run: node scripts/seed-benchmark-data.mjs");
    process.exit(1);
  }

  const today = todayIso();
  const monthStart = monthStartIso();

  await run("prisma clothingItem.findMany (paginated)", async () => {
    const rows = await prisma.clothingItem.findMany({
      where: { sku: { startsWith: "BENCH-" } },
      take: 50,
      skip: 0,
      orderBy: { id: "asc" },
    });
    if (!rows.length) throw new Error("empty page");
  });

  await run("prisma booking.findMany (paginated)", async () => {
    const rows = await prisma.booking.findMany({
      where: { bookingNumber: { startsWith: "BENCH-BKG-" } },
      take: 50,
      skip: 100,
      include: { bookingItems: true },
      orderBy: { deliveryDate: "desc" },
    });
    if (!rows.length) throw new Error("empty page");
  });

  await run("getBookingListData (today)", async () => {
    const data = await getBookingListData(today, today, "", "", "");
    if (!data || typeof data !== "object") throw new Error("no data");
  });

  await run("dashboard stats queries (prisma)", async () => {
    const [items, bookings, customers] = await Promise.all([
      prisma.clothingItem.count(),
      prisma.booking.count(),
      prisma.customer.count(),
    ]);
    if (!items || !bookings) throw new Error("empty counts");
    if (customers < 0) throw new Error("invalid customer count");
  });

  await run("getAvailableItemsApi (today)", async () => {
    const data = await getAvailableItemsApi(today, today, "");
    if (!Array.isArray(data.free_items)) throw new Error("missing free_items");
  });

  await run("monthBasedSearchBookings (customer)", async () => {
    const result = await monthBasedSearchBookings("Bench Customer", today, "", "1", "25");
    if (!result.results?.length) throw new Error("no matches for Bench Customer");
  });

  await run("universalSearchBookings", async () => {
    const result = await universalSearchBookings("Bench", today, "", "1", "25");
    if (!result.results?.length) throw new Error("universal search empty");
  });

  await run("dashboardSearchBookings (active phone)", async () => {
    const sample = await prisma.booking.findFirst({
      where: {
        bookingNumber: { startsWith: "BENCH-BKG-" },
        status: { in: ["booked", "delivered"] },
      },
      select: { contact1: true },
    });
    if (!sample?.contact1) throw new Error("no active bench booking");
    const result = await dashboardSearchBookings(sample.contact1, today);
    if (!result.results?.length) throw new Error("dashboard search empty");
  });

  await run("getManagedCategoryGroups", async () => {
    const groups = await getManagedCategoryGroups();
    const total = Object.values(groups).reduce((s, g) => s + g.length, 0);
    if (!total) throw new Error("no categories");
  });

  await run("delivery search query", async () => {
    const rows = await prisma.booking.findMany({
      where: {
        status: { in: ["booked", "delivered"] },
        deliveryDate: { gte: new Date(monthStart) },
      },
      take: 50,
      orderBy: { deliveryDate: "asc" },
    });
    if (!rows.length) throw new Error("no delivery candidates");
  });

  await run("return search query", async () => {
    const rows = await prisma.booking.findMany({
      where: {
        status: { in: ["delivered", "booked"] },
        returnDate: { gte: new Date(monthStart) },
      },
      take: 50,
      orderBy: { returnDate: "asc" },
    });
    if (!rows.length) throw new Error("no return candidates");
  });

  await run("all-record-search style query", async () => {
    const rows = await prisma.booking.findMany({
      where: {
        OR: [
          { customerName: { contains: "Bench", mode: "insensitive" } },
          { contact1: { contains: "98" } },
        ],
      },
      take: 50,
      orderBy: { createdAt: "desc" },
    });
    if (!rows.length) throw new Error("no records");
  });

  await run("inventory status groupBy", async () => {
    const g = await prisma.clothingItem.groupBy({
      by: ["status"],
      where: { sku: { startsWith: "BENCH-" } },
      _count: { id: true },
    });
    if (!g.length) throw new Error("no groups");
  });

  await run("getReturningToday (alternate list — hot date)", async () => {
    const rows = await getReturningToday("2026-06-15");
    if (!rows.length) throw new Error("no alternate handovers on 2026-06-15 — run seed-alternate-handover.mjs");
    const first = rows[0] as { next_booking?: { customer_name?: string } };
    if (!first.next_booking?.customer_name) throw new Error("alternate row missing next_booking");
  });

  await run("getReturningToday (alternate list — today)", async () => {
    await getReturningToday(today);
  });

  await run("getDashboardStatList (returning-today)", async () => {
    const rows = await getDashboardStatList("returning-today");
    if (!Array.isArray(rows)) throw new Error("not an array");
  });

  console.log("\n=== Benchmark service tests ===\n");
  let passed = 0;
  for (const r of results) {
    const mark = r.ok ? "PASS" : "FAIL";
    if (r.ok) passed++;
    console.log(`${mark}  ${r.name} (${r.ms}ms)${r.detail ? ` — ${r.detail}` : ""}`);
  }
  console.log(`\n${passed}/${results.length} passed`);
  if (passed !== results.length) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
