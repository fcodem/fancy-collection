/**
 * Service-layer benchmark tests (invoked by test-benchmark-full.mjs).
 * Usage: npx tsx scripts/test-benchmark-services.ts
 */
import prisma from "../src/lib/prisma";
import { todayIso, monthStartIso } from "../src/lib/constants";
import { getBookingListData } from "../src/lib/services/bookingList";
import { getAvailableItemsApi } from "../src/lib/booking";
import { bookingDateCheck } from "../src/lib/services/operations";
import {
  monthBasedSearchBookings,
  universalSearchBookings,
  dashboardSearchBookings,
} from "../src/lib/services/bookingSearchCore";
import { getManagedCategoryGroups } from "../src/lib/services/adminOps";
import { listPostponedBookings } from "../src/lib/services/postponedBooking";
import { getDailySale } from "../src/lib/services/finance";

type Result = { name: string; ok: boolean; ms: number; rowCount?: number | null; detail?: string };

const results: Result[] = [];

async function run(name: string, fn: () => Promise<{ rowCount?: number | null } | void>) {
  const t0 = Date.now();
  try {
    const out = await fn();
    results.push({
      name,
      ok: true,
      ms: Date.now() - t0,
      rowCount: out && "rowCount" in out ? out.rowCount : undefined,
    });
  } catch (e) {
    results.push({
      name,
      ok: false,
      ms: Date.now() - t0,
      detail: e instanceof Error ? e.message : String(e),
    });
  }
}

async function findHardOverlapSample() {
  const rows = await prisma.$queryRaw<
    Array<{ item_id: number; d1: Date; r1: Date }>
  >`
    SELECT bi1.item_id AS item_id, b1.delivery_date AS d1, b1.return_date AS r1
    FROM bookings b1
    JOIN booking_items bi1 ON bi1.booking_id = b1.id
    JOIN bookings b2 ON b2.id > b1.id
    JOIN booking_items bi2 ON bi2.booking_id = b2.id AND bi2.item_id = bi1.item_id
    WHERE b1.booking_number LIKE 'BENCH-BKG-%'
      AND b2.booking_number LIKE 'BENCH-BKG-%'
      AND b1.status IN ('booked', 'delivered')
      AND b2.status IN ('booked', 'delivered')
      AND b1.delivery_date = b2.delivery_date
      AND b1.return_date = b2.return_date
    LIMIT 1
  `;
  return rows[0] ?? null;
}

async function main() {
  const benchItems = await prisma.clothingItem.count({ where: { sku: { startsWith: "BENCH-" } } });
  const benchBookings = await prisma.booking.count({
    where: { bookingNumber: { startsWith: "BENCH-BKG-" } },
  });

  if (!benchItems || benchBookings < 1000) {
    console.error("Insufficient benchmark data.");
    process.exit(1);
  }

  const today = todayIso();
  const monthStart = monthStartIso();

  await run("getBookingListData (today)", async () => {
    const data = await getBookingListData(today, today, "", "", "");
    return { rowCount: data.bookings?.length ?? 0 };
  });

  await run("getAvailableItemsApi (today)", async () => {
    const data = await getAvailableItemsApi(today, today, "");
    return { rowCount: data.free_items?.length ?? 0 };
  });

  await run("getAvailableItemsApi excludes hard overlap", async () => {
    const s = await findHardOverlapSample();
    if (!s) throw new Error("no identical-date overlap in seed");
    const dIso = s.d1.toISOString().slice(0, 10);
    const rIso = s.r1.toISOString().slice(0, 10);
    const data = await getAvailableItemsApi(dIso, rIso, "");
    const blocked = !data.free_items.some((i) => i.id === s.item_id);
    if (!blocked) throw new Error("overlapped item still in free_items");
    return { rowCount: data.free_items.length };
  });

  await run("bookingDateCheck (hard overlap)", async () => {
    const s = await findHardOverlapSample();
    if (!s) throw new Error("no identical-date overlap in seed");
    const dIso = s.d1.toISOString().slice(0, 10);
    const rIso = s.r1.toISOString().slice(0, 10);
    const check = await bookingDateCheck(0, dIso, rIso, [s.item_id]);
    const blocked = check.some((c) => c.status === "hard_conflict");
    if (!blocked) throw new Error("expected hard_conflict");
    return { rowCount: check.length };
  });

  await run("bookingDateCheck (multi-item, 1000+ bookings)", async () => {
    const sampleItems = await prisma.$queryRaw<Array<{ item_id: number; d1: Date; r1: Date }>>`
      SELECT bi.item_id AS item_id, b.delivery_date AS d1, b.return_date AS r1
      FROM bookings b
      JOIN booking_items bi ON bi.booking_id = b.id
      WHERE b.booking_number LIKE 'BENCH-BKG-%'
        AND b.status IN ('booked', 'delivered')
        AND bi.is_cancelled = false
        AND bi.is_returned = false
        AND bi.item_id IS NOT NULL
      ORDER BY b.id DESC
      LIMIT 5
    `;
    if (!sampleItems.length) throw new Error("no benchmark items");
    const anchor = sampleItems[0];
    const dIso = anchor.d1.toISOString().slice(0, 10);
    const rIso = anchor.r1.toISOString().slice(0, 10);
    const itemIds = sampleItems.map((s) => s.item_id);
    const check = await bookingDateCheck(0, dIso, rIso, itemIds);
    if (check.length !== itemIds.length) throw new Error("missing per-item results");
    return { rowCount: check.length };
  });

  await run("monthBasedSearchBookings", async () => {
    const result = await monthBasedSearchBookings("Bench Customer", today, "", "1", "25");
    if (!result.results?.length) throw new Error("empty");
    return { rowCount: result.results.length };
  });

  await run("universalSearchBookings", async () => {
    const result = await universalSearchBookings("Bench", today, "", "1", "25");
    if (!result.results?.length) throw new Error("empty");
    return { rowCount: result.results.length };
  });

  await run("dashboardSearchBookings", async () => {
    const sample = await prisma.booking.findFirst({
      where: { bookingNumber: { startsWith: "BENCH-BKG-" }, status: { in: ["booked", "delivered"] } },
      select: { contact1: true },
    });
    if (!sample?.contact1) throw new Error("no sample");
    const result = await dashboardSearchBookings(sample.contact1, today);
    if (!result.results?.length) throw new Error("empty");
    return { rowCount: result.results.length };
  });

  await run("getManagedCategoryGroups", async () => {
    const groups = await getManagedCategoryGroups();
    const total = Object.values(groups).reduce((s, g) => s + g.length, 0);
    if (!total) throw new Error("no categories");
    return { rowCount: total };
  });

  await run("listPostponedBookings", async () => {
    const data = await listPostponedBookings("");
    return { rowCount: data.count ?? data.results?.length ?? 0 };
  });

  await run("incomplete_return query", async () => {
    const rows = await prisma.booking.findMany({
      where: { status: "incomplete_return", bookingNumber: { startsWith: "BENCH-BKG-" } },
      take: 50,
    });
    if (!rows.length) throw new Error("no incomplete returns");
    return { rowCount: rows.length };
  });

  await run("getDailySale", async () => {
    const data = await getDailySale(today);
    return { rowCount: Object.keys(data.advance_by_category ?? {}).length };
  });

  await run("delivery search (prisma)", async () => {
    const rows = await prisma.booking.findMany({
      where: { status: { in: ["booked", "delivered"] }, deliveryDate: { gte: new Date(monthStart) } },
      take: 50,
    });
    if (!rows.length) throw new Error("empty");
    return { rowCount: rows.length };
  });

  await run("return search (prisma)", async () => {
    const rows = await prisma.booking.findMany({
      where: { status: { in: ["delivered", "booked"] }, returnDate: { gte: new Date(monthStart) } },
      take: 50,
    });
    if (!rows.length) throw new Error("empty");
    return { rowCount: rows.length };
  });

  console.log("\n=== Service benchmark tests ===\n");
  let passed = 0;
  for (const r of results) {
    const mark = r.ok ? "PASS" : "FAIL";
    if (r.ok) passed++;
    console.log(
      `${mark}  ${r.name} (${r.ms}ms)` +
        (r.rowCount != null ? ` rows=${r.rowCount}` : "") +
        (r.detail ? ` — ${r.detail}` : ""),
    );
  }
  console.log(`\n${passed}/${results.length} passed`);
  console.log("---JSON---");
  console.log(JSON.stringify(results));

  if (passed !== results.length) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
