/**
 * End-to-end slip + WhatsApp test for all scope cases (single / combined / full).
 *
 * Usage (from web/):
 *   npx tsx scripts/test-all-slip-whatsapp.ts
 *
 * Creates test bookings with 4 dresses each, sends slips to WHATSAPP_TEST_PHONE (default 8077843874).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import prisma from "../src/lib/prisma";
import { createBooking } from "../src/lib/services/bookingCrud";
import { saveDelivery, saveReturn } from "../src/lib/services/operations";
import {
  scheduleBookingBill,
  processWhatsAppJobQueue,
} from "../src/lib/services/whatsapp/jobQueue";
import { finalizeSlipTrigger } from "../src/lib/services/whatsapp/slipDebounce";
import { findFirstItemConflict } from "../src/lib/booking";
import { isWhatsAppReceiptsDisabled } from "../src/lib/services/whatsapp/metaApi";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

const PHONE = process.env.WHATSAPP_TEST_PHONE || "8077843874";
const DELIVERY_DATE = "2026-06-10";
const RETURN_DATE = "2026-08-06";
const ORIGIN = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const BY = "slip-test-script";

type ItemRow = { id: number; name: string; category: string; size: string | null };

async function findAvailableItems(count: number, exclude: Set<number>): Promise<ItemRow[]> {
  const candidates = await prisma.clothingItem.findMany({
    where: {
      status: "available",
      sku: { not: { startsWith: "BENCH-" } },
      id: { notIn: [...exclude] },
    },
    select: { id: true, name: true, category: true, size: true },
    orderBy: { id: "asc" },
    take: 200,
  });

  const picked: ItemRow[] = [];
  for (const item of candidates) {
    const conflict = await findFirstItemConflict(
      [item.id],
      DELIVERY_DATE,
      RETURN_DATE,
      undefined,
    );
    if (conflict) continue;
    picked.push(item);
    if (picked.length >= count) break;
  }
  if (picked.length < count) {
    throw new Error(`Need ${count} free dresses for ${DELIVERY_DATE}–${RETURN_DATE}; found ${picked.length}`);
  }
  return picked;
}

function bookingPayload(items: ItemRow[], label: string) {
  return {
    customer_name: `SLIP TEST ${label}`,
    customer_address: "TEST MBD",
    contact_1: PHONE,
    whatsapp_no: PHONE,
    payment_mode: "cash" as const,
    delivery_date: DELIVERY_DATE,
    delivery_time: "12:00 Noon",
    return_date: RETURN_DATE,
    return_time: "12:00 Noon",
    venue: "SLIP TEST VENUE",
    security_deposit: 1000,
    common_notes: `AUTO SLIP TEST ${label}`,
    items: items.map((it, i) => ({
      item_id: it.id,
      dress_name: it.name,
      price: 1000 + i * 100,
      advance: 500,
      notes: `TEST ${label}`,
    })),
  };
}

async function sendBookingSlip(bookingId: number) {
  await scheduleBookingBill(bookingId, ORIGIN, BY);
  const results = await processWhatsAppJobQueue(5, { bookingId });
  return results;
}

async function deliverItems(bookingId: number, bookingItemIds: number[], label: string) {
  await saveDelivery(
    bookingId,
    {
      payment_mode: "cash",
      security_payment_mode: "cash",
      items: bookingItemIds.map((id) => ({
        booking_item_id: id,
        remaining_collected: 500,
        security_collected: 250,
        delivery_notes: `Delivered ${label}`,
        mark_delivered: true,
      })),
    },
    BY,
  );
  await finalizeSlipTrigger(bookingId, "delivery", {
    requestOrigin: ORIGIN,
    createdBy: BY,
  });
  return processWhatsAppJobQueue(5, { bookingId });
}

async function returnItems(bookingId: number, bookingItemIds: number[]) {
  for (const id of bookingItemIds) {
    await saveReturn(bookingId, "mark_item_returned", { booking_item_id: id }, BY);
  }
  await finalizeSlipTrigger(bookingId, "return", {
    requestOrigin: ORIGIN,
    createdBy: BY,
  });
  return processWhatsAppJobQueue(5, { bookingId });
}

async function markAllReturned(bookingId: number) {
  await saveReturn(bookingId, "mark_returned", {}, BY);
  await finalizeSlipTrigger(bookingId, "return", {
    requestOrigin: ORIGIN,
    createdBy: BY,
  });
  return processWhatsAppJobQueue(5, { bookingId });
}

async function mixedIncompleteReturn(
  bookingId: number,
  returnedIds: number[],
  incompleteIds: number[],
) {
  const items = [
    ...returnedIds.map((booking_item_id) => ({
      booking_item_id,
      is_incomplete: false,
    })),
    ...incompleteIds.map((booking_item_id) => ({
      booking_item_id,
      is_incomplete: true,
      incomplete_notes: "Test incomplete — missing accessory",
      security_held: 200,
    })),
  ];
  await saveReturn(
    bookingId,
    "incomplete_return",
    { items, incomplete_notes: "Mixed return test" },
    BY,
  );
  await finalizeSlipTrigger(bookingId, "return", {
    requestOrigin: ORIGIN,
    createdBy: BY,
  });
  return processWhatsAppJobQueue(10, { bookingId });
}

async function getBookingItemIds(bookingId: number): Promise<number[]> {
  const rows = await prisma.bookingItem.findMany({
    where: { bookingId },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

async function logStep(step: string, bookingId: number, results: unknown) {
  const jobs = await prisma.whatsAppJob.findMany({
    where: { bookingId },
    orderBy: { id: "desc" },
    take: 5,
    select: { id: true, jobType: true, status: true, failedReason: true },
  });
  console.log(`\n=== ${step} (booking #${bookingId}) ===`);
  console.log("Queue:", JSON.stringify(results, null, 2));
  console.log("Recent jobs:", jobs);
}

async function main() {
  if (isWhatsAppReceiptsDisabled()) {
    console.error("WHATSAPP_RECEIPTS_DISABLED is true — set to false in .env.local first.");
    process.exit(1);
  }

  console.log(`Slip test → ${PHONE} | delivery ${DELIVERY_DATE} | return ${RETURN_DATE}`);

  const usedItemIds = new Set<number>();
  const summary: Array<{ case: string; bookingId: number; slip: string }> = [];

  // ── B1: Sequential delivery + return on one 4-dress bill ──────────────────
  const b1Items = await findAvailableItems(4, usedItemIds);
  b1Items.forEach((i) => usedItemIds.add(i.id));

  const b1 = await createBooking(bookingPayload(b1Items, "B1-SEQUENTIAL"), BY);
  const b1Ids = await getBookingItemIds(b1.id);
  await logStep("1. Booking slip (4 dresses combined)", b1.id, await sendBookingSlip(b1.id));
  summary.push({ case: "Booking combined (4)", bookingId: b1.id, slip: "booking_bill" });

  await logStep(
    "2. Delivery single (dress 1)",
    b1.id,
    await deliverItems(b1.id, [b1Ids[0]!], "single"),
  );
  summary.push({ case: "Delivery single", bookingId: b1.id, slip: "delivery_slip" });

  await logStep(
    "3. Delivery combined (dresses 2+3)",
    b1.id,
    await deliverItems(b1.id, [b1Ids[1]!, b1Ids[2]!], "combined-2"),
  );
  summary.push({ case: "Delivery combined (2)", bookingId: b1.id, slip: "delivery_slip" });

  await logStep(
    "4. Delivery single (dress 4)",
    b1.id,
    await deliverItems(b1.id, [b1Ids[3]!], "single-last"),
  );
  summary.push({ case: "Delivery single (last)", bookingId: b1.id, slip: "delivery_slip" });

  await logStep(
    "5. Return single (dress 1)",
    b1.id,
    await returnItems(b1.id, [b1Ids[0]!]),
  );
  summary.push({ case: "Return single", bookingId: b1.id, slip: "return_slip" });

  await logStep(
    "6. Return combined (dresses 2+3)",
    b1.id,
    await returnItems(b1.id, [b1Ids[1]!, b1Ids[2]!]),
  );
  summary.push({ case: "Return combined (2)", bookingId: b1.id, slip: "return_slip" });

  // Leave dress 4 for mixed test on B1 — mark incomplete on dress 4 only
  await logStep(
    "7. Incomplete single (dress 4)",
    b1.id,
    await mixedIncompleteReturn(b1.id, [], [b1Ids[3]!]),
  );
  summary.push({ case: "Incomplete single", bookingId: b1.id, slip: "incomplete_slip" });

  // Resolve incomplete so items become available for next bookings
  await saveReturn(b1.id, "resolve_incomplete_return", {}, BY);
  await finalizeSlipTrigger(b1.id, "return", { requestOrigin: ORIGIN, createdBy: BY });
  await processWhatsAppJobQueue(5, { bookingId: b1.id });

  // ── B2: Full delivery (all 4 at once) ───────────────────────────────────
  const b2Items = await findAvailableItems(4, usedItemIds);
  b2Items.forEach((i) => usedItemIds.add(i.id));

  const b2 = await createBooking(bookingPayload(b2Items, "B2-FULL-DELIVERY"), BY);
  const b2Ids = await getBookingItemIds(b2.id);
  await sendBookingSlip(b2.id);

  await logStep(
    "8. Delivery full (all 4 at once)",
    b2.id,
    await deliverItems(b2.id, b2Ids, "full-4"),
  );
  summary.push({ case: "Delivery full (4)", bookingId: b2.id, slip: "delivery_slip" });

  // ── B3: Full return (mark all returned) ─────────────────────────────────
  await logStep("9. Return full (all 4)", b2.id, await markAllReturned(b2.id));
  summary.push({ case: "Return full (4)", bookingId: b2.id, slip: "return_slip" });

  // ── B4: Mixed incomplete + proper return in one submit ──────────────────
  const b4Items = await findAvailableItems(4, usedItemIds);
  b4Items.forEach((i) => usedItemIds.add(i.id));

  const b4 = await createBooking(bookingPayload(b4Items, "B4-MIXED-RETURN"), BY);
  const b4Ids = await getBookingItemIds(b4.id);
  await sendBookingSlip(b4.id);
  await deliverItems(b4.id, b4Ids, "all-for-mixed");

  await logStep(
    "10. Mixed return (2 proper + 2 incomplete)",
    b4.id,
    await mixedIncompleteReturn(b4.id, [b4Ids[0]!, b4Ids[1]!], [b4Ids[2]!, b4Ids[3]!]),
  );
  summary.push({ case: "Return combined (2) + incomplete combined (2)", bookingId: b4.id, slip: "return_slip + incomplete_slip" });

  console.log("\n════════ SUMMARY ════════");
  console.table(summary);
  console.log(`\nCheck WhatsApp on +91${PHONE.replace(/\D/g, "").slice(-10)} for ${summary.length} slip sends.`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
