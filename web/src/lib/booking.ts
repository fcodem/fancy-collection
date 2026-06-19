import prisma from "./prisma";
import { dressDisplayName, buildDressSearchWhere, serializeBookingItems } from "./dress";
import { bookingListRecordFrom, bookingWarningRecordFrom } from "./bookingDetails";
import { serialPositionToValue, generateNumber } from "./serial";
import { parseDate, startOfMonth, endOfMonth, formatDate } from "./constants";
import type { Booking, BookingItem, ClothingItem, Prisma } from "@prisma/client";

type BookingWithItems = Booking & {
  bookingItems: (BookingItem & { item?: ClothingItem | null })[];
  legacyItem?: ClothingItem | null;
};

const bookingWarningInclude = {
  bookingItems: { include: { item: true } },
  legacyItem: true,
} as const;

function bookingItemIds(b: Pick<Booking, "itemId"> & { bookingItems: { itemId: number }[] }): number[] {
  if (b.bookingItems.length) return b.bookingItems.map((bi) => bi.itemId);
  if (b.itemId) return [b.itemId];
  return [];
}

function warningRecordFromBooking(b: BookingWithItems) {
  return bookingWarningRecordFrom({ ...b, id: b.id, monthlySerial: b.monthlySerial });
}

export function bookingUsesItem(booking: BookingWithItems, itemId: number): boolean {
  if (booking.bookingItems?.length) {
    return booking.bookingItems.some((bi) => bi.itemId === itemId);
  }
  return booking.itemId === itemId;
}

function serializeBookingConflict(b: Booking) {
  return {
    customer: b.customerName,
    serial_no: b.monthlySerial,
    delivery_date: formatDate(b.deliveryDate, "iso"),
    delivery_time: b.deliveryTime,
    return_date: formatDate(b.returnDate, "iso"),
    return_time: b.returnTime,
    venue: b.venue || "",
    total_rent: b.totalPrice || b.price,
    contact: b.contact1 || "",
    booking_id: b.id,
  };
}

export async function checkItemAvailabilityForDates(
  item: ClothingItem,
  dDate: Date,
  rDate: Date,
  excludeBookingId?: number
) {
  if (item.status === "maintenance") {
    return {
      status: "not_available" as const,
      reason: "Item is under maintenance",
      returning_warning: null,
      booked_warning: null,
      blocking_booking: null,
    };
  }

  const overlapping = await prisma.booking.findMany({
    where: {
      status: { in: ["booked", "delivered"] },
      deliveryDate: { lte: rDate },
      returnDate: { gte: dDate },
      ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
    },
    include: bookingWarningInclude,
  });

  let returning_warning: ReturnType<typeof serializeBookingConflict> & { return_time?: string } | null = null;
  let booked_warning: ReturnType<typeof serializeBookingConflict> | null = null;
  let blocking_booking: ReturnType<typeof serializeBookingConflict> | null = null;

  for (const b of overlapping) {
    if (!bookingUsesItem(b as BookingWithItems, item.id)) continue;
    const bD = formatDate(b.deliveryDate, "iso");
    const bR = formatDate(b.returnDate, "iso");
    const dIso = formatDate(dDate, "iso");
    const rIso = formatDate(rDate, "iso");
    if (bR === dIso) {
      returning_warning = { ...serializeBookingConflict(b), return_time: b.returnTime };
      continue;
    }
    if (bD === rIso) {
      booked_warning = serializeBookingConflict(b);
      continue;
    }
    blocking_booking = serializeBookingConflict(b);
    break;
  }

  if (blocking_booking) {
    return {
      status: "not_available" as const,
      reason: "Booked during selected dates",
      returning_warning,
      booked_warning,
      blocking_booking,
    };
  }

  if (returning_warning || booked_warning) {
    return {
      status: "available_with_warning" as const,
      reason: "Available with scheduling note",
      returning_warning,
      booked_warning,
      blocking_booking: null,
    };
  }

  return {
    status: "available" as const,
    reason: "Free for entire period",
    returning_warning: null,
    booked_warning: null,
    blocking_booking: null,
  };
}

export async function searchBookingsByText(queryText: string, extraWhere: Prisma.BookingWhereInput = {}) {
  const q = queryText.trim();
  if (!q) {
    return prisma.booking.findMany({ where: extraWhere, include: { bookingItems: { include: { item: true } }, legacyItem: true } });
  }

  const words = q.split(/\s+/).filter(Boolean);
  const dressFilters = words.map((word) => ({
    OR: [
      { dressName: { contains: word, mode: "insensitive" as const } },
      { bookingItems: { some: { dressName: { contains: word, mode: "insensitive" as const } } } },
    ],
  }));

  return prisma.booking.findMany({
    where: {
      ...extraWhere,
      OR: [
        { customerName: { contains: q, mode: "insensitive" } },
        { contact1: { contains: q, mode: "insensitive" } },
        { whatsappNo: { contains: q, mode: "insensitive" } },
        { bookingNumber: { contains: q, mode: "insensitive" } },
        ...(words.length ? [{ AND: dressFilters }] : []),
        ...(!isNaN(Number(q)) ? [{ monthlySerial: Number(q) }] : []),
      ],
    },
    include: { bookingItems: { include: { item: true } }, legacyItem: true },
  });
}

export function serializeBookingForList(b: BookingWithItems) {
  const record = bookingListRecordFrom({ ...b, id: b.id, monthlySerial: b.monthlySerial });
  return {
    ...record,
    id: b.id,
    booking_number: b.bookingNumber,
    serial: b.monthlySerial,
    serial_no: b.monthlySerial,
    status: b.status,
    total_price: b.totalPrice,
    total_remaining: b.totalRemaining,
    items: serializeBookingItems(b),
  };
}

export async function getNextMonthlySerial(deliveryDate: Date) {
  const monthStart = startOfMonth(deliveryDate);
  const monthEnd = endOfMonth(deliveryDate);
  const count = await prisma.booking.count({
    where: { deliveryDate: { gte: monthStart, lt: monthEnd } },
  });
  return serialPositionToValue(count + 1);
}

export async function createBookingNumber() {
  return generateNumber("BKG", async (pattern) => {
    const last = await prisma.booking.findFirst({
      where: { bookingNumber: { startsWith: pattern.replace("%", "") } },
      orderBy: { bookingNumber: "desc" },
    });
    return last?.bookingNumber || null;
  });
}

export async function getAvailableItemsApi(
  deliveryDateStr: string,
  returnDateStr: string,
  categoryFilter = "",
  excludeBookingId?: number
) {
  const dDate = parseDate(deliveryDateStr);
  const rDate = parseDate(returnDateStr);
  const exclude = excludeBookingId ? { id: { not: excludeBookingId } } : {};

  const [allItems, overlappingBookings, returningOnDeliveryBookings, bookedOnReturnBookings, overlappingRentals] =
    await Promise.all([
      prisma.clothingItem.findMany({
        where: {
          status: { not: "maintenance" },
          ...(categoryFilter ? { category: categoryFilter } : {}),
        },
        orderBy: [{ category: "asc" }, { name: "asc" }],
      }),
      prisma.booking.findMany({
        where: {
          ...exclude,
          status: { in: ["booked", "delivered"] },
          deliveryDate: { lte: rDate },
          returnDate: { gte: dDate },
        },
        include: bookingWarningInclude,
      }),
      prisma.booking.findMany({
        where: {
          ...exclude,
          status: { in: ["booked", "delivered"] },
          returnDate: dDate,
        },
        include: bookingWarningInclude,
      }),
      prisma.booking.findMany({
        where: {
          ...exclude,
          status: { in: ["booked", "delivered"] },
          deliveryDate: rDate,
        },
        include: bookingWarningInclude,
      }),
      prisma.rental.findMany({
        where: {
          status: { in: ["active", "overdue"] },
          startDate: { lte: rDate },
          endDate: { gte: dDate },
        },
        include: { items: true },
      }),
    ]);

  const dIso = formatDate(dDate, "iso");
  const rIso = formatDate(rDate, "iso");

  const busyItemIds = new Set<number>();
  const returningInfo: Record<number, ReturnType<typeof warningRecordFromBooking>> = {};
  const bookedOnReturnInfo: Record<number, ReturnType<typeof warningRecordFromBooking>> = {};

  for (const b of overlappingBookings) {
    for (const itemId of bookingItemIds(b)) {
      const bD = formatDate(b.deliveryDate, "iso");
      const bR = formatDate(b.returnDate, "iso");
      if (bR === dIso) {
        if (!returningInfo[itemId]) returningInfo[itemId] = warningRecordFromBooking(b as BookingWithItems);
      } else if (bD === rIso) {
        if (!bookedOnReturnInfo[itemId]) bookedOnReturnInfo[itemId] = warningRecordFromBooking(b as BookingWithItems);
      } else {
        busyItemIds.add(itemId);
      }
    }
  }

  const rentedItemIds = new Set<number>();
  for (const r of overlappingRentals) {
    for (const ri of r.items) rentedItemIds.add(ri.itemId);
  }

  const free_items = allItems
    .filter((i) => !busyItemIds.has(i.id) && !rentedItemIds.has(i.id))
    .map((i) => ({
      id: i.id,
      name: i.name,
      display_name: dressDisplayName(i.name, i.category, i.size),
      sku: i.sku,
      category: i.category,
      color: i.color,
      size: i.size,
      item_type: i.itemType,
      sub_category: i.subCategory || "Normal",
      photo: i.photo || "",
      returning_warning: returningInfo[i.id] || null,
      booked_warning: bookedOnReturnInfo[i.id] || null,
    }));

  const returning_on_delivery = returningOnDeliveryBookings.flatMap((b) =>
    bookingItemIds(b).map((itemId) => ({
      item_id: itemId,
      ...warningRecordFromBooking(b as BookingWithItems),
    }))
  );

  const booked_on_return = bookedOnReturnBookings.flatMap((b) =>
    bookingItemIds(b).map((itemId) => ({
      item_id: itemId,
      ...warningRecordFromBooking(b as BookingWithItems),
    }))
  );

  return { free_items, returning_on_delivery, booked_on_return };
}

export { buildDressSearchWhere, dressDisplayName, serializeBookingItems };
