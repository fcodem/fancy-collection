import prisma from "@/lib/prisma";
import { createBooking } from "@/lib/services/bookingCrud";
import { saveDelivery, saveReturn } from "@/lib/services/operations";
import {
  scheduleBookingBill,
  processWhatsAppJobQueue,
} from "@/lib/services/whatsapp/jobQueue";
import { finalizeSlipTrigger } from "@/lib/services/whatsapp/slipDebounce";
import { findFirstItemConflict } from "@/lib/booking";
import { isWhatsAppReceiptsDisabled } from "@/lib/services/whatsapp/metaApi";

type ItemRow = { id: number; name: string; category: string; size: string | null };

export type TestAllSlipsResult = {
  phone: string;
  deliveryDate: string;
  returnDate: string;
  summary: Array<{ case: string; bookingId: number; slip: string }>;
};

const SLIP_TEST_SKU_PREFIX = "SLIP-TEST-";

async function ensureSlipTestItems(count: number): Promise<ItemRow[]> {
  const existing = await prisma.clothingItem.findMany({
    where: { sku: { startsWith: SLIP_TEST_SKU_PREFIX } },
    select: { id: true, name: true, category: true, size: true },
    orderBy: { sku: "asc" },
  });

  for (let i = existing.length; i < count; i++) {
    const n = String(i + 1).padStart(2, "0");
    await prisma.clothingItem.create({
      data: {
        name: `SLIP TEST DRESS ${n}`,
        sku: `${SLIP_TEST_SKU_PREFIX}${n}`,
        category: "Lehenga",
        itemType: "clothing",
        size: "M",
        color: "Gold",
        dailyRate: 1000,
        deposit: 2000,
        status: "available",
      },
    });
  }

  const rows = await prisma.clothingItem.findMany({
    where: { sku: { startsWith: SLIP_TEST_SKU_PREFIX } },
    select: { id: true, name: true, category: true, size: true },
    orderBy: { sku: "asc" },
    take: count,
  });

  await prisma.clothingItem.updateMany({
    where: { id: { in: rows.map((r) => r.id) } },
    data: { status: "available" },
  });

  return rows;
}

async function findAvailableItems(
  count: number,
  exclude: Set<number>,
  deliveryDate: string,
  returnDate: string,
): Promise<ItemRow[]> {
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
      deliveryDate,
      returnDate,
      undefined,
    );
    if (conflict) continue;
    picked.push(item);
    if (picked.length >= count) break;
  }
  if (picked.length < count) {
    throw new Error(
      `Need ${count} free dresses for ${deliveryDate}–${returnDate}; found ${picked.length}`,
    );
  }
  return picked;
}

function bookingPayload(
  items: ItemRow[],
  label: string,
  phone: string,
  deliveryDate: string,
  returnDate: string,
) {
  return {
    customer_name: `SLIP TEST ${label}`,
    customer_address: "TEST MBD",
    contact_1: phone,
    whatsapp_no: phone,
    payment_mode: "cash" as const,
    delivery_date: deliveryDate,
    delivery_time: "12:00 Noon",
    return_date: returnDate,
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

async function getBookingItemIds(bookingId: number): Promise<number[]> {
  const rows = await prisma.bookingItem.findMany({
    where: { bookingId },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

export async function runTestAllSlips(opts: {
  phone: string;
  deliveryDate: string;
  returnDate: string;
  requestOrigin: string;
  createdBy: string;
}): Promise<TestAllSlipsResult> {
  if (isWhatsAppReceiptsDisabled()) {
    throw new Error("WHATSAPP_RECEIPTS_DISABLED is true — set to false in .env.local first.");
  }

  const { phone, deliveryDate, returnDate, requestOrigin, createdBy } = opts;
  const usedItemIds = new Set<number>();
  const summary: TestAllSlipsResult["summary"] = [];

  async function sendBookingSlip(bookingId: number) {
    await scheduleBookingBill(bookingId, requestOrigin, createdBy);
    await processWhatsAppJobQueue(5, { bookingId });
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
      createdBy,
    );
    await finalizeSlipTrigger(bookingId, "delivery", { requestOrigin, createdBy });
    await processWhatsAppJobQueue(5, { bookingId });
  }

  async function returnItems(bookingId: number, bookingItemIds: number[]) {
    for (const id of bookingItemIds) {
      await saveReturn(bookingId, "mark_item_returned", { booking_item_id: id }, createdBy);
    }
    await finalizeSlipTrigger(bookingId, "return", { requestOrigin, createdBy });
    await processWhatsAppJobQueue(5, { bookingId });
  }

  async function markAllReturned(bookingId: number) {
    await saveReturn(bookingId, "mark_returned", {}, createdBy);
    await finalizeSlipTrigger(bookingId, "return", { requestOrigin, createdBy });
    await processWhatsAppJobQueue(5, { bookingId });
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
      createdBy,
    );
    await finalizeSlipTrigger(bookingId, "return", { requestOrigin, createdBy });
    await processWhatsAppJobQueue(10, { bookingId });
  }

  const findItems = async (n: number) => {
    const testItems = await ensureSlipTestItems(n);
    return testItems.slice(0, n);
  };

  // Legacy pool lookup (unused when SLIP-TEST items exist)
  const _findPoolItems = (n: number) =>
    findAvailableItems(n, usedItemIds, deliveryDate, returnDate);

  // B1: sequential delivery + return
  const b1Items = await findItems(4);
  b1Items.forEach((i) => usedItemIds.add(i.id));
  const b1 = await createBooking(
    bookingPayload(b1Items, "B1-SEQUENTIAL", phone, deliveryDate, returnDate),
    createdBy,
  );
  const b1Ids = await getBookingItemIds(b1.id);
  await sendBookingSlip(b1.id);
  summary.push({ case: "Booking combined (4)", bookingId: b1.id, slip: "booking_bill" });

  await deliverItems(b1.id, [b1Ids[0]!], "single");
  summary.push({ case: "Delivery single", bookingId: b1.id, slip: "delivery_slip" });

  await deliverItems(b1.id, [b1Ids[1]!, b1Ids[2]!], "combined-2");
  summary.push({ case: "Delivery combined (2)", bookingId: b1.id, slip: "delivery_slip" });

  await deliverItems(b1.id, [b1Ids[3]!], "single-last");
  summary.push({ case: "Delivery single (last)", bookingId: b1.id, slip: "delivery_slip" });

  await returnItems(b1.id, [b1Ids[0]!]);
  summary.push({ case: "Return single", bookingId: b1.id, slip: "return_slip" });

  await returnItems(b1.id, [b1Ids[1]!, b1Ids[2]!]);
  summary.push({ case: "Return combined (2)", bookingId: b1.id, slip: "return_slip" });

  await mixedIncompleteReturn(b1.id, [], [b1Ids[3]!]);
  summary.push({ case: "Incomplete single", bookingId: b1.id, slip: "incomplete_slip" });

  await saveReturn(b1.id, "resolve_incomplete_return", {}, createdBy);
  await finalizeSlipTrigger(b1.id, "return", { requestOrigin, createdBy });
  await processWhatsAppJobQueue(5, { bookingId: b1.id });

  // B2: full delivery + full return
  const b2Items = await findItems(4);
  b2Items.forEach((i) => usedItemIds.add(i.id));
  const b2 = await createBooking(
    bookingPayload(b2Items, "B2-FULL", phone, deliveryDate, returnDate),
    createdBy,
  );
  const b2Ids = await getBookingItemIds(b2.id);
  await sendBookingSlip(b2.id);
  await deliverItems(b2.id, b2Ids, "full-4");
  summary.push({ case: "Delivery full (4)", bookingId: b2.id, slip: "delivery_slip" });
  await markAllReturned(b2.id);
  summary.push({ case: "Return full (4)", bookingId: b2.id, slip: "return_slip" });

  // B4: mixed incomplete + return
  const b4Items = await findItems(4);
  b4Items.forEach((i) => usedItemIds.add(i.id));
  const b4 = await createBooking(
    bookingPayload(b4Items, "B4-MIXED", phone, deliveryDate, returnDate),
    createdBy,
  );
  const b4Ids = await getBookingItemIds(b4.id);
  await sendBookingSlip(b4.id);
  await deliverItems(b4.id, b4Ids, "all-for-mixed");
  await mixedIncompleteReturn(b4.id, [b4Ids[0]!, b4Ids[1]!], [b4Ids[2]!, b4Ids[3]!]);
  summary.push({
    case: "Return combined (2) + incomplete combined (2)",
    bookingId: b4.id,
    slip: "return_slip + incomplete_slip",
  });

  return { phone, deliveryDate, returnDate, summary };
}
