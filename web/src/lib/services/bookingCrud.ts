import prisma, { parseDateQ, dateQ } from "../prisma";
import { createBookingNumber, getNextMonthlySerial } from "../booking";
import { parseDate, formatDate, assertBookingDatesNotPast } from "../constants";
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

async function findFirstConflictForItems(
  itemIds: number[],
  deliveryDate: Date,
  returnDate: Date,
  excludeBookingId?: number,
) {
  if (!itemIds.length) return null;

  const dIso = formatDate(deliveryDate, "iso");
  const rIso = formatDate(returnDate, "iso");

  const bookings = await prisma.booking.findMany({
    where: {
      ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
      status: { in: ["booked", "delivered"] },
      deliveryDate: { lte: dateQ(returnDate) },
      returnDate: { gte: dateQ(deliveryDate) },
      OR: [
        { itemId: { in: itemIds } },
        { bookingItems: { some: { itemId: { in: itemIds } } } },
      ],
    },
    include: { bookingItems: true },
  });

  for (const itemId of itemIds) {
    for (const b of bookings) {
      const bD = formatDate(b.deliveryDate, "iso");
      const bR = formatDate(b.returnDate, "iso");
      if (bR === dIso || bD === rIso) continue;
      const usesItem =
        b.bookingItems.some((bi) => bi.itemId === itemId) || b.itemId === itemId;
      if (usesItem) return { itemId, booking: b };
    }
  }
  return null;
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
  const items = await prisma.clothingItem.findMany({ where: { id: { in: itemIds } } });
  const itemMap = new Map(items.map((item) => [item.id, item]));

  const itemsToBook: ItemToBook[] = [];
  for (const row of input.items) {
    const item = itemMap.get(row.item_id);
    if (!item) throw new Error(`Dress '${row.dress_name}' not found.`);
    itemsToBook.push({ item, row });
  }

  const conflict = await findFirstConflictForItems(itemIds, deliveryDate, returnDate);
  if (conflict) {
    const row = input.items.find((r) => r.item_id === conflict.itemId);
    throw new Error(
      `'${row?.dress_name || "Dress"}' is already booked (Serial #${String(conflict.booking.monthlySerial).padStart(2, "0")}).`
    );
  }

  const bookingNumber = await createBookingNumber();
  const monthlySerial = await getNextMonthlySerial(deliveryDate);
  const totalPrice = input.items.reduce((s, i) => s + i.price, 0);
  const totalAdvance = input.items.reduce((s, i) => s + i.advance, 0);
  const totalRemaining = totalPrice - totalAdvance;
  const staffNames = (input.staff_names || []).filter(Boolean).join(", ");

  const booking = await prisma.$transaction(async (tx) => {
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

    const existing = await tx.customer.findFirst({ where: { phone: input.contact_1.trim() } });
    if (!existing) {
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

  const conflict = await findFirstConflictForItems(itemIds, deliveryDate, returnDate, bookingId);
  if (conflict) {
    const row = input.items.find((r) => r.item_id === conflict.itemId);
    throw new Error(
      `'${row?.dress_name || "Dress"}' is already booked (Serial #${String(conflict.booking.monthlySerial).padStart(2, "0")}).`
    );
  }

  const totalPrice = input.items.reduce((s, i) => s + i.price, 0);
  const totalAdvance = input.items.reduce((s, i) => s + i.advance, 0);
  const totalRemaining = totalPrice - totalAdvance;
  const staffNames = (input.staff_names || []).filter(Boolean).join(", ");

  await prisma.$transaction(async (tx) => {
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
    broadcastShopEvent({ type: "booking.updated", bookingId, status: updated.status, by });
    logActivity({
      username: by || "system",
      action: "updated",
      entity: "booking",
      entityId: bookingId,
      label: `Booking #${String(updated.monthlySerial).padStart(2, "0")} — ${updated.customerName}`,
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
