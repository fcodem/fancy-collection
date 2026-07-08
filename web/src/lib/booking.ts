import prisma, { parseDateQ } from "./prisma";
import {
  whereBookingOverlapsPeriod,
  whereDeliveryInRange,
  whereDeliveryInMonth,
  whereReturnInRange,
} from "./bookingDateQuery";
import { dressDisplayName, buildDressSearchWhere, serializeBookingItems } from "./dress";
import { bookingListRecordFrom, bookingWarningRecordFrom, balanceLeftToCollect, securityCurrentlyHeld } from "./bookingDetails";
import { isStarBooking } from "./starBooking";
import { nextValidSerial, serialPositionToValue, generateNumber } from "./serial";
import { formatDate } from "./constants";
import { resolveBookingStatus } from "./bookingStatus";
import { cachedQuery } from "./perfCache";
import {
  itemHasJewelleryParts,
  partsPresentOnItem,
  mergeBookedParts,
  availablePartsForItem,
  allPartsBooked,
  type JewelleryPartKey,
} from "./jewelleryParts";
import type { Booking, BookingItem, ClothingItem, Prisma } from "@prisma/client";
import { catalogPhotoRef } from "./catalogPhotoRef";

type DbClient = Prisma.TransactionClient | typeof prisma;

type BookingWithItems = Booking & {
  bookingItems: (BookingItem & { item?: Pick<ClothingItem, "size" | "category" | "sku"> | null })[];
  legacyItem?: Pick<ClothingItem, "size" | "category" | "sku"> | null;
};

export type { BookingWithItems };

const bookingWarningInclude = {
  bookingItems: { select: { itemId: true, dressName: true, category: true, size: true, notes: true } },
  legacyItem: { select: { size: true } },
} as const;

function bookingItemIds(b: Pick<Booking, "itemId"> & { bookingItems: { itemId: number | null }[] }): number[] {
  if (b.bookingItems.length) {
    return b.bookingItems.map((bi) => bi.itemId).filter((id): id is number => id != null);
  }
  if (b.itemId) return [b.itemId];
  return [];
}

function warningRecordFromBooking(b: BookingWithItems) {
  return bookingWarningRecordFrom({ ...b, id: b.id, monthlySerial: b.monthlySerial });
}

export function bookingUsesItem(
  booking: Pick<Booking, "itemId"> & { bookingItems?: { itemId: number | null }[] },
  itemId: number,
): boolean {
  if (booking.bookingItems?.length) {
    return booking.bookingItems.some((bi) => bi.itemId === itemId);
  }
  return booking.itemId === itemId;
}

/** Batch check which item IDs are still on other active (booked/delivered) bookings. */
export async function findItemIdsStillInActiveBookings(
  itemIds: number[],
  excludeBookingId: number,
  tx?: Prisma.TransactionClient,
): Promise<Set<number>> {
  if (!itemIds.length) return new Set();
  const db: DbClient = tx ?? prisma;
  const bookings = await db.booking.findMany({
    where: {
      id: { not: excludeBookingId },
      status: { in: ["booked", "delivered"] },
      OR: [
        { itemId: { in: itemIds } },
        { bookingItems: { some: { itemId: { in: itemIds } } } },
      ],
    },
    select: {
      itemId: true,
      bookingItems: { select: { itemId: true } },
    },
  });
  const stillUsed = new Set<number>();
  for (const b of bookings) {
    if (b.itemId != null && itemIds.includes(b.itemId)) stillUsed.add(b.itemId);
    for (const bi of b.bookingItems) {
      if (bi.itemId != null && itemIds.includes(bi.itemId)) stillUsed.add(bi.itemId);
    }
  }
  return stillUsed;
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

type BookingWithBookingItems = Booking & { bookingItems: { itemId: number | null }[] };

/**
 * Find an existing booked/delivered booking that blocks these items for the date range.
 * Allows same-day return→delivery handover (edge dates); blocks true double-booking.
 */
export async function findFirstItemConflict(
  itemIds: number[],
  deliveryDateStr: string,
  returnDateStr: string,
  excludeBookingId?: number,
  tx?: Prisma.TransactionClient,
): Promise<{ itemId: number; booking: BookingWithBookingItems } | null> {
  if (!itemIds.length) return null;

  const db: DbClient = tx ?? prisma;
  const dIso = deliveryDateStr.slice(0, 10);
  const rIso = returnDateStr.slice(0, 10);

  const bookings = await db.booking.findMany({
    where: {
      ...(await whereBookingOverlapsPeriod(dIso, rIso)),
      ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
      status: { in: ["booked", "delivered"] },
      OR: [
        { itemId: { in: itemIds } },
        { bookingItems: { some: { itemId: { in: itemIds } } } },
      ],
    },
    include: { bookingItems: { select: { itemId: true } } },
  });

  for (const itemId of itemIds) {
    for (const b of bookings) {
      const bD = formatDate(b.deliveryDate, "iso");
      const bR = formatDate(b.returnDate, "iso");
      // Same-day handover is allowed (returning morning, delivering afternoon).
      if (bR === dIso || bD === rIso) continue;
      if (bookingUsesItem(b, itemId)) return { itemId, booking: b };
    }
  }
  return null;
}

export function formatItemConflictError(
  dressName: string,
  serial: number,
): string {
  return `'${dressName || "Dress"}' is already booked (Serial #${String(serial).padStart(2, "0")}).`;
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

  const dIso = formatDate(dDate, "iso");
  const rIso = formatDate(rDate, "iso");

  const overlapping = await prisma.booking.findMany({
    where: {
      ...(await whereBookingOverlapsPeriod(dIso, rIso)),
      status: { in: ["booked", "delivered"] },
      ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
    },
    include: bookingWarningInclude,
  });

  let returning_warning: ReturnType<typeof serializeBookingConflict> & { return_time?: string } | null = null;
  let booked_warning: ReturnType<typeof serializeBookingConflict> | null = null;
  let blocking_booking: ReturnType<typeof serializeBookingConflict> | null = null;

  for (const b of overlapping) {
    if (!bookingUsesItem(b, item.id)) continue;
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
      { dressName: { contains: word } },
      { bookingItems: { some: { dressName: { contains: word } } } },
    ],
  }));

  return prisma.booking.findMany({
    where: {
      ...extraWhere,
      OR: [
        { customerName: { contains: q } },
        { contact1: { contains: q } },
        { whatsappNo: { contains: q } },
        { bookingNumber: { contains: q } },
        ...(words.length ? [{ AND: dressFilters }] : []),
        ...(!isNaN(Number(q)) ? [{ monthlySerial: Number(q) }] : []),
      ],
    },
    include: { bookingItems: { include: { item: true } }, legacyItem: true },
  });
}

export function serializeBookingForList(b: BookingWithItems) {
  const record = bookingListRecordFrom({ ...b, id: b.id, monthlySerial: b.monthlySerial });
  const totalRemaining = b.totalRemaining ?? b.remaining ?? 0;
  const remainingCollected = b.remainingCollected ?? 0;
  const status = resolveBookingStatus(b);
  const deliveryItems = b.bookingItems.map((bi) => ({
    itemSecurityCollected: bi.itemSecurityCollected,
    isDelivered: bi.isDelivered,
  }));
  return {
    ...record,
    id: b.id,
    booking_number: b.bookingNumber,
    serial: b.monthlySerial,
    serial_no: b.monthlySerial,
    status,
    total_price: b.totalPrice,
    total_remaining: totalRemaining,
    remaining_collected: remainingCollected,
    security_collected: b.securityCollected ?? 0,
    security_held: securityCurrentlyHeld({
      status,
      securityHeld: b.securityHeld,
      securityCollected: b.securityCollected,
      securityDeposit: b.securityDeposit,
      items: deliveryItems,
    }),
    delivery_notes: b.deliveryNotes || "",
    balance_remaining: balanceLeftToCollect(totalRemaining, remainingCollected),
    items: serializeBookingItems(b),
    is_star: isStarBooking(b),
  };
}

export async function getNextMonthlySerial(deliveryDate: Date, client: DbClient = prisma) {
  const monthWhere = await whereDeliveryInMonth(deliveryDate);

  const [count, maxAgg] = await Promise.all([
    client.booking.count({ where: monthWhere }),
    client.booking.aggregate({ where: monthWhere, _max: { monthlySerial: true } }),
  ]);

  let candidate = serialPositionToValue(count + 1);
  const maxSerial = maxAgg._max.monthlySerial ?? 0;
  if (candidate <= maxSerial) {
    candidate = nextValidSerial(maxSerial + 1);
  }

  for (let attempt = 0; attempt < 24; attempt++) {
    const clash = await client.booking.findFirst({
      where: { ...monthWhere, monthlySerial: candidate },
      select: { id: true },
    });
    if (!clash) return candidate;
    candidate = nextValidSerial(candidate + 1);
  }

  return candidate;
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
  const dDate = parseDateQ(deliveryDateStr);
  const rDate = parseDateQ(returnDateStr);
  const dIso = formatDate(dDate, "iso");
  const rIso = formatDate(rDate, "iso");
  const exclude = excludeBookingId ? { id: { not: excludeBookingId } } : {};

  const [overlapWhere, returnOnDeliveryWhere, deliveryOnReturnWhere] = await Promise.all([
    whereBookingOverlapsPeriod(deliveryDateStr, returnDateStr),
    whereReturnInRange(deliveryDateStr, deliveryDateStr),
    whereDeliveryInRange(returnDateStr, returnDateStr),
  ]);

  const [
    allItems,
    overlappingBookings,
    returningOnDeliveryBookings,
    bookedOnReturnBookings,
    overlappingRentals,
    overlappingJewellery,
  ] =
    await Promise.all([
      prisma.clothingItem.findMany({
        where: {
          status: { not: "maintenance" },
          ...(categoryFilter ? { category: categoryFilter } : {}),
        },
        select: {
          id: true,
          name: true,
          sku: true,
          category: true,
          color: true,
          size: true,
          itemType: true,
          subCategory: true,
          photo: true,
          hasNecklace: true,
          hasEarrings: true,
          hasTeeka: true,
          hasPasa: true,
        },
        orderBy: [{ category: "asc" }, { name: "asc" }],
      }),
      prisma.booking.findMany({
        where: {
          ...exclude,
          ...overlapWhere,
          status: { in: ["booked", "delivered"] },
        },
        include: bookingWarningInclude,
      }),
      prisma.booking.findMany({
        where: {
          ...exclude,
          ...returnOnDeliveryWhere,
          status: { in: ["booked", "delivered"] },
        },
        include: bookingWarningInclude,
      }),
      prisma.booking.findMany({
        where: {
          ...exclude,
          ...deliveryOnReturnWhere,
          status: { in: ["booked", "delivered"] },
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
      prisma.bookingJewellery.findMany({
        where: {
          status: "active",
          itemId: { not: null },
          booking: {
            ...exclude,
            status: { in: ["booked", "delivered"] },
            deliveryDate: { lte: rDate },
            returnDate: { gte: dDate },
          },
        },
        select: {
          itemId: true,
          pickNecklace: true,
          pickEarrings: true,
          pickTeeka: true,
          pickPasa: true,
          booking: { include: bookingWarningInclude },
        },
      }),
    ]);

  const busyItemIds = new Set<number>();
  const returningInfo: Record<number, ReturnType<typeof warningRecordFromBooking> & { customer?: string; contact?: string }> = {};
  const bookedOnReturnInfo: Record<number, ReturnType<typeof warningRecordFromBooking> & { customer?: string; contact?: string }> = {};

  for (const b of overlappingBookings) {
    for (const itemId of bookingItemIds(b)) {
      const bD = formatDate(b.deliveryDate, "iso");
      const bR = formatDate(b.returnDate, "iso");
      if (bR === dIso) {
        if (!returningInfo[itemId]) {
          const rec = warningRecordFromBooking(b as BookingWithItems);
          returningInfo[itemId] = { ...rec, customer: rec.customer_name, contact: rec.contact_1 };
        }
      } else if (bD === rIso) {
        if (!bookedOnReturnInfo[itemId]) {
          const rec = warningRecordFromBooking(b as BookingWithItems);
          bookedOnReturnInfo[itemId] = { ...rec, customer: rec.customer_name, contact: rec.contact_1 };
        }
      } else {
        busyItemIds.add(itemId);
      }
    }
  }

  const rentedItemIds = new Set<number>();
  for (const r of overlappingRentals) {
    for (const ri of r.items) {
      if (ri.itemId != null) rentedItemIds.add(ri.itemId);
    }
  }

  // Jewellery part-level availability from Jewellery Selection records.
  type JewPick = { itemId: number | null; pickNecklace: boolean; pickEarrings: boolean; pickTeeka: boolean; pickPasa: boolean };
  const jewInteriorByItem = new Map<number, JewPick[]>();
  for (const js of overlappingJewellery) {
    if (js.itemId == null) continue;
    const bD = formatDate(js.booking.deliveryDate, "iso");
    const bR = formatDate(js.booking.returnDate, "iso");
    if (bR === dIso) {
      if (!returningInfo[js.itemId]) {
        const rec = warningRecordFromBooking(js.booking as unknown as BookingWithItems);
        returningInfo[js.itemId] = { ...rec, customer: rec.customer_name, contact: rec.contact_1 };
      }
    } else if (bD === rIso) {
      if (!bookedOnReturnInfo[js.itemId]) {
        const rec = warningRecordFromBooking(js.booking as unknown as BookingWithItems);
        bookedOnReturnInfo[js.itemId] = { ...rec, customer: rec.customer_name, contact: rec.contact_1 };
      }
    } else {
      const arr = jewInteriorByItem.get(js.itemId) || [];
      arr.push({
        itemId: js.itemId,
        pickNecklace: js.pickNecklace,
        pickEarrings: js.pickEarrings,
        pickTeeka: js.pickTeeka,
        pickPasa: js.pickPasa,
      });
      jewInteriorByItem.set(js.itemId, arr);
    }
  }

  const jewBookedParts: Record<number, JewelleryPartKey[]> = {};
  const jewFreeParts: Record<number, JewelleryPartKey[]> = {};
  for (const it of allItems) {
    if (it.itemType !== "jewellery") continue;
    const itemParts = {
      hasNecklace: it.hasNecklace,
      hasEarrings: it.hasEarrings,
      hasTeeka: it.hasTeeka,
      hasPasa: it.hasPasa,
    };
    const hasParts = itemHasJewelleryParts(itemParts);
    const interior = jewInteriorByItem.get(it.id) || [];
    if (!interior.length) continue;
    const booked = mergeBookedParts(itemParts, interior, it.id);
    if (hasParts && !allPartsBooked(itemParts, booked)) {
      jewBookedParts[it.id] = Array.from(booked);
      jewFreeParts[it.id] = availablePartsForItem(itemParts, booked);
    } else {
      // Fully booked (either all parts taken, or a partless jewellery item is taken).
      busyItemIds.add(it.id);
    }
  }

  const free_items = allItems
    .filter((i) => !busyItemIds.has(i.id) && !rentedItemIds.has(i.id))
    .map((i) => {
      const isJewellery = i.itemType === "jewellery";
      const itemParts = {
        hasNecklace: i.hasNecklace,
        hasEarrings: i.hasEarrings,
        hasTeeka: i.hasTeeka,
        hasPasa: i.hasPasa,
      };
      const hasParts = isJewellery && itemHasJewelleryParts(itemParts);
      return {
        id: i.id,
        name: i.name,
        display_name: dressDisplayName(i.name, i.category, i.size),
        sku: i.sku,
        category: i.category,
        color: i.color,
        size: i.size,
        item_type: i.itemType,
        sub_category: i.subCategory || "Normal",
        photo: catalogPhotoRef(i),
        has_necklace: i.hasNecklace,
        has_earrings: i.hasEarrings,
        has_teeka: i.hasTeeka,
        has_pasa: i.hasPasa,
        booked_parts: isJewellery ? jewBookedParts[i.id] || [] : [],
        available_parts: hasParts ? jewFreeParts[i.id] ?? partsPresentOnItem(itemParts) : [],
        returning_warning: returningInfo[i.id] || null,
        booked_warning: bookedOnReturnInfo[i.id] || null,
      };
    });

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

export function getAvailableItemsApiCached(
  deliveryDateStr: string,
  returnDateStr: string,
  categoryFilter = "",
  excludeBookingId?: number,
) {
  return cachedQuery(
    ["available-items", deliveryDateStr, returnDateStr, categoryFilter, String(excludeBookingId ?? 0)],
    () => getAvailableItemsApi(deliveryDateStr, returnDateStr, categoryFilter, excludeBookingId),
    30,
  );
}

export { buildDressSearchWhere, dressDisplayName, serializeBookingItems };
