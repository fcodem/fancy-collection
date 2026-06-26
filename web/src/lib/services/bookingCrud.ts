import prisma, { parseDateQ } from "../prisma";
import {
  findFirstItemConflict,
  formatItemConflictError,
  createBookingNumber,
  getNextMonthlySerial,
} from "../booking";
import { parseDate, assertBookingDatesNotPast } from "../constants";
import { shouldSkipCustomerCreate } from "./customersOps";
import { broadcastShopEvent } from "../realtime/broadcast";
import { logActivity, snapshotBooking } from "../activityLog";

export type BookingItemInput = {
  item_id: number;
  dress_name: string;
  price: number;
  advance: number;
  notes?: string;
};

export type BookingFormInput = {
  customer_name: string;
  customer_address: string;
  contact_1: string;
  whatsapp_no: string;
  delivery_date: string;
  delivery_time: string;
  return_date: string;
  return_time: string;
  venue?: string;
  security_deposit?: number;
  common_notes?: string;
  staff_names?: string[];
  items: BookingItemInput[];
};

type ItemToBook = {
  item: NonNullable<Awaited<ReturnType<typeof prisma.clothingItem.findUnique>>>;
  row: BookingItemInput;
};

function assertUniqueItemIds(itemIds: number[]) {
  if (new Set(itemIds).size !== itemIds.length) {
    throw new Error("Each dress can only be selected once per booking.");
  }
}

function throwIfConflict(
  conflict: Awaited<ReturnType<typeof findFirstItemConflict>>,
  items: BookingItemInput[],
) {
  if (!conflict) return;
  const row = items.find((r) => r.item_id === conflict.itemId);
  throw new Error(
    formatItemConflictError(row?.dress_name || "Dress", conflict.booking.monthlySerial),
  );
}

export async function createBooking(input: BookingFormInput, by?: string) {
  assertBookingDatesNotPast(input.delivery_date, input.return_date);
  const deliveryDate = parseDate(input.delivery_date);
  const returnDate = parseDate(input.return_date);
  if (returnDate < deliveryDate) throw new Error("Return date must be on or after delivery date.");
  const deliveryDateQ = parseDateQ(input.delivery_date);
  const returnDateQ = parseDateQ(input.return_date);
  if (!input.items.length) throw new Error("Please select at least one dress.");

  const itemIds = input.items.map((row) => row.item_id);
  assertUniqueItemIds(itemIds);
  const items = await prisma.clothingItem.findMany({ where: { id: { in: itemIds } } });
  const itemMap = new Map(items.map((item) => [item.id, item]));

  const itemsToBook: ItemToBook[] = [];
  for (const row of input.items) {
    const item = itemMap.get(row.item_id);
    if (!item) throw new Error(`Dress '${row.dress_name}' not found.`);
    itemsToBook.push({ item, row });
  }

  const bookingNumber = await createBookingNumber();
  const skipCustomer = await shouldSkipCustomerCreate(input.contact_1, input.whatsapp_no);

  const booking = await prisma.$transaction(async (tx) => {
    throwIfConflict(
      await findFirstItemConflict(itemIds, input.delivery_date, input.return_date, undefined, tx),
      input.items,
    );

    const monthlySerial = await getNextMonthlySerial(deliveryDate, tx);
    const totalPrice = input.items.reduce((s, i) => s + i.price, 0);
    const totalAdvance = input.items.reduce((s, i) => s + i.advance, 0);
    const totalRemaining = totalPrice - totalAdvance;
    const staffNames = (input.staff_names || []).filter(Boolean).join(", ");

    const b = await tx.booking.create({
      data: {
        bookingNumber,
        monthlySerial,
        customerName: input.customer_name.trim(),
        customerAddress: input.customer_address.trim(),
        contact1: input.contact_1.trim(),
        whatsappNo: input.whatsapp_no.trim(),
        venue: input.venue?.trim() || null,
        staffNames: staffNames || null,
        deliveryDate: deliveryDateQ,
        deliveryTime: input.delivery_time,
        returnDate: returnDateQ,
        returnTime: input.return_time,
        securityDeposit: input.security_deposit || 0,
        totalPrice,
        totalAdvance,
        totalRemaining,
        commonNotes: input.common_notes?.trim() || null,
        itemId: itemsToBook[0].item.id,
        dressName: itemsToBook[0].row.dress_name,
        price: totalPrice,
        advance: totalAdvance,
        remaining: totalRemaining,
      },
    });

    for (const { item, row } of itemsToBook) {
      await tx.bookingItem.create({
        data: {
          bookingId: b.id,
          itemId: item.id,
          dressName: row.dress_name,
          category: item.category,
          size: item.size || "",
          price: row.price,
          advance: row.advance,
          remaining: row.price - row.advance,
          notes: row.notes || null,
        },
      });
      await tx.clothingItem.update({ where: { id: item.id }, data: { status: "rented" } });
    }

    if (!skipCustomer) {
      await tx.customer.create({
        data: {
          name: input.customer_name.trim(),
          phone: input.contact_1.trim(),
          address: input.customer_address.trim(),
        },
      });
    }

    return b;
  });

  broadcastShopEvent({ type: "booking.created", bookingId: booking.id, status: booking.status, by });

  const full = await prisma.booking.findUnique({ where: { id: booking.id }, include: { bookingItems: true } });
  logActivity({
    username: by || "system",
    action: "created",
    entity: "booking",
    entityId: booking.id,
    label: `Booking #${String(booking.monthlySerial).padStart(2, "0")} — ${input.customer_name} (${input.items.map(i => i.dress_name).join(", ")})`,
    after: full ? snapshotBooking(full as unknown as Record<string, unknown>) : undefined,
  });

  return booking;
}

export async function updateBooking(bookingId: number, input: BookingFormInput, by?: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { bookingItems: true },
  });
  if (!booking) throw new Error("Booking not found.");
  const beforeSnapshot = snapshotBooking(booking as unknown as Record<string, unknown>);

  assertBookingDatesNotPast(input.delivery_date, input.return_date);
  const deliveryDate = parseDate(input.delivery_date);
  const returnDate = parseDate(input.return_date);
  if (returnDate < deliveryDate) throw new Error("Return date must be on or after delivery date.");
  const deliveryDateQ = parseDateQ(input.delivery_date);
  const returnDateQ = parseDateQ(input.return_date);
  if (!input.items.length) throw new Error("Please select at least one dress.");

  const oldItemIds = new Set([
    ...booking.bookingItems.map((bi) => bi.itemId),
    ...(booking.itemId ? [booking.itemId] : []),
  ]);

  const itemIds = input.items.map((row) => row.item_id);
  assertUniqueItemIds(itemIds);
  const items = await prisma.clothingItem.findMany({ where: { id: { in: itemIds } } });
  const itemMap = new Map(items.map((item) => [item.id, item]));

  const itemsToBook: ItemToBook[] = [];
  const newItemIds = new Set<number>();
  for (const row of input.items) {
    const item = itemMap.get(row.item_id);
    if (!item) throw new Error(`Dress '${row.dress_name}' not found.`);
    itemsToBook.push({ item, row });
    newItemIds.add(item.id);
  }

  const totalPrice = input.items.reduce((s, i) => s + i.price, 0);
  const totalAdvance = input.items.reduce((s, i) => s + i.advance, 0);
  const totalRemaining = totalPrice - totalAdvance;
  const staffNames = (input.staff_names || []).filter(Boolean).join(", ");

  await prisma.$transaction(async (tx) => {
    throwIfConflict(
      await findFirstItemConflict(itemIds, input.delivery_date, input.return_date, bookingId, tx),
      input.items,
    );

    await tx.booking.update({
      where: { id: bookingId },
      data: {
        customerName: input.customer_name.trim(),
        customerAddress: input.customer_address.trim(),
        contact1: input.contact_1.trim(),
        whatsappNo: input.whatsapp_no.trim(),
        venue: input.venue?.trim() || null,
        staffNames: staffNames || null,
        deliveryDate: deliveryDateQ,
        deliveryTime: input.delivery_time,
        returnDate: returnDateQ,
        returnTime: input.return_time,
        securityDeposit: input.security_deposit || 0,
        commonNotes: input.common_notes?.trim() || null,
        totalPrice,
        totalAdvance,
        totalRemaining,
        itemId: itemsToBook[0].item.id,
        dressName: itemsToBook[0].row.dress_name,
        price: totalPrice,
        advance: totalAdvance,
        remaining: totalRemaining,
      },
    });

    await tx.bookingItem.deleteMany({ where: { bookingId } });

    for (const { item, row } of itemsToBook) {
      await tx.bookingItem.create({
        data: {
          bookingId,
          itemId: item.id,
          dressName: row.dress_name,
          category: item.category,
          size: item.size || "",
          price: row.price,
          advance: row.advance,
          remaining: row.price - row.advance,
          notes: row.notes || null,
        },
      });
      await tx.clothingItem.update({ where: { id: item.id }, data: { status: "rented" } });
    }

    const freedIds = [...oldItemIds].filter((id) => !newItemIds.has(id));
    for (const freedId of freedIds) {
      const stillBooked = await tx.booking.findFirst({
        where: {
          id: { not: bookingId },
          status: { in: ["booked", "delivered"] },
          OR: [{ itemId: freedId }, { bookingItems: { some: { itemId: freedId } } }],
        },
      });
      if (!stillBooked) {
        await tx.clothingItem.update({ where: { id: freedId }, data: { status: "available" } });
      }
    }
  });

  const updated = await prisma.booking.findUnique({ where: { id: bookingId }, include: { bookingItems: true } });
  if (updated) {
    const beforeDresses = booking.bookingItems.map((bi) => bi.dressName).filter(Boolean);
    const afterDresses = input.items.map((i) => i.dress_name).filter(Boolean);
    const dressList = afterDresses.join(", ");
    let label = `Booking #${String(updated.monthlySerial).padStart(2, "0")} — ${updated.customerName}`;
    if (dressList) label += ` (${dressList})`;
    if (beforeDresses.join("|") !== afterDresses.join("|")) {
      label += ` · Dress change: ${beforeDresses.join(", ") || "—"} → ${afterDresses.join(", ") || "—"}`;
    }
    broadcastShopEvent({ type: "booking.updated", bookingId, status: updated.status, by });
    logActivity({
      username: by || "system",
      action: "updated",
      entity: "booking",
      entityId: bookingId,
      label,
      before: beforeSnapshot,
      after: snapshotBooking(updated as unknown as Record<string, unknown>),
    });
  }
  return updated;
}

export async function getNextSerialForDate(deliveryDateStr: string) {
  const d = parseDate(deliveryDateStr);
  const serial = await getNextMonthlySerial(d);
  return { serial, display: String(serial).padStart(2, "0") };
}
