import prisma from "../prisma";
import { createBookingNumber, getNextMonthlySerial } from "../booking";
import { parseDate, formatDate, assertBookingDatesNotPast } from "../constants";

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

async function findConflict(
  itemId: number,
  deliveryDate: Date,
  returnDate: Date,
  excludeBookingId?: number
) {
  const dIso = formatDate(deliveryDate, "iso");
  const rIso = formatDate(returnDate, "iso");

  const bookings = await prisma.booking.findMany({
    where: {
      ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
      status: { in: ["booked", "delivered"] },
      deliveryDate: { lte: returnDate },
      returnDate: { gte: deliveryDate },
    },
    include: { bookingItems: true },
  });

  for (const b of bookings) {
    const bD = formatDate(b.deliveryDate, "iso");
    const bR = formatDate(b.returnDate, "iso");
    if (bR === dIso || bD === rIso) continue; // edge-day allowed
    const usesItem =
      b.bookingItems.some((bi) => bi.itemId === itemId) || b.itemId === itemId;
    if (usesItem) return b;
  }
  return null;
}

export async function createBooking(input: BookingFormInput) {
  assertBookingDatesNotPast(input.delivery_date, input.return_date);
  const deliveryDate = parseDate(input.delivery_date);
  const returnDate = parseDate(input.return_date);
  if (returnDate < deliveryDate) throw new Error("Return date must be on or after delivery date.");
  if (!input.items.length) throw new Error("Please select at least one dress.");

  const itemsToBook: ItemToBook[] = [];
  for (const row of input.items) {
    const item = await prisma.clothingItem.findUnique({ where: { id: row.item_id } });
    if (!item) throw new Error(`Dress '${row.dress_name}' not found.`);
    const conflict = await findConflict(item.id, deliveryDate, returnDate);
    if (conflict) {
      throw new Error(
        `'${row.dress_name}' is already booked (Serial #${String(conflict.monthlySerial).padStart(2, "0")}).`
      );
    }
    itemsToBook.push({ item, row });
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
        deliveryDate,
        deliveryTime: input.delivery_time,
        returnDate,
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

  return booking;
}

export async function updateBooking(bookingId: number, input: BookingFormInput) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { bookingItems: true },
  });
  if (!booking) throw new Error("Booking not found.");

  assertBookingDatesNotPast(input.delivery_date, input.return_date);
  const deliveryDate = parseDate(input.delivery_date);
  const returnDate = parseDate(input.return_date);
  if (returnDate < deliveryDate) throw new Error("Return date must be on or after delivery date.");
  if (!input.items.length) throw new Error("Please select at least one dress.");

  const oldItemIds = new Set([
    ...booking.bookingItems.map((bi) => bi.itemId),
    ...(booking.itemId ? [booking.itemId] : []),
  ]);

  const itemsToBook: ItemToBook[] = [];
  const newItemIds = new Set<number>();
  for (const row of input.items) {
    const item = await prisma.clothingItem.findUnique({ where: { id: row.item_id } });
    if (!item) throw new Error(`Dress '${row.dress_name}' not found.`);
    const conflict = await findConflict(item.id, deliveryDate, returnDate, bookingId);
    if (conflict) {
      throw new Error(
        `'${row.dress_name}' is already booked (Serial #${String(conflict.monthlySerial).padStart(2, "0")}).`
      );
    }
    itemsToBook.push({ item, row });
    newItemIds.add(item.id);
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
        deliveryDate,
        deliveryTime: input.delivery_time,
        returnDate,
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

  return prisma.booking.findUnique({ where: { id: bookingId }, include: { bookingItems: true } });
}

export async function getNextSerialForDate(deliveryDateStr: string) {
  const d = parseDate(deliveryDateStr);
  const serial = await getNextMonthlySerial(d);
  return { serial, display: String(serial).padStart(2, "0") };
}
