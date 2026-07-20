import prisma, { isSqliteDb, parseDateQ } from "../prisma";
import { searchBookingDateCheck } from "./bookingDateCheckSearch";
import { revalidateTag, unstable_cache } from "next/cache";
import { activeBookingWhere } from "@/lib/bookingActiveStatus";
import { whereBookingOverlapsPeriod, whereDeliveryInRange, whereReturnInRange, whereReturnOnAnyDates } from "../bookingDateQuery";
import { formatDate, parseDate } from "../constants";
import { Prisma } from "@prisma/client";
import { dressDisplayName, bookingItemSize, serializeBookingItems } from "../dress";
import { catalogPhotoRef } from "../catalogPhotoRef";
import { serializeStandardBookingDetails, bookingWarningRecordFrom } from "../bookingDetails";
import { isStarBooking } from "../starBooking";
import { getAvailableItemsApi, bookingUsesItem, findItemIdsStillInActiveBookings } from "../booking";
import { broadcastShopEvent } from "../realtime/broadcast";
import { logActivity, snapshotBooking } from "../activityLog";
import { saveIdProofUpload, IdProofUploadError, deleteUpload } from "../upload";
import { trackBookingPrivateMedia } from "../bookingPrivateMediaTracking";
import { BOOKING_PRIVATE_MEDIA_TYPES } from "../bookingPrivateMediaTypes";
import { syncBookingStatusFromItems } from "../syncBookingStatusFromItems";
import { cachedQuery } from "../perfCache";
import { serializeActiveOrders } from "../slipBookingData";

export { syncBookingStatusFromItems } from "../syncBookingStatusFromItems";

export async function repairAllBookingStatuses() {
  // Fetch all booked statuses in one query — no findUnique inside the loop
  const bookings = await prisma.booking.findMany({
    where: { status: "booked" },
    select: { id: true, status: true },
  });

  let fixed = 0;
  for (const booking of bookings) {
    const before = booking.status;
    const after = await syncBookingStatusFromItems(booking.id);
    if (after && before !== after.status) fixed += 1;
  }
  return fixed;
}

function collectFullReturnPhotoPaths(booking: {
  incompletePhoto?: string | null;
  idPhoto1?: string | null;
  idPhoto2?: string | null;
  bookingItems?: Array<{ itemIncompletePhoto?: string | null }>;
}): string[] {
  return [
    booking.incompletePhoto,
    booking.idPhoto1,
    booking.idPhoto2,
    ...(booking.bookingItems?.map((bi) => bi.itemIncompletePhoto) ?? []),
  ].filter((p): p is string => !!p);
}

/** When every delivered dress is returned (none incomplete), close the booking. */
async function finalizeFullReturnIfComplete(
  bookingId: number,
  tx: Prisma.TransactionClient,
): Promise<string[]> {
  const booking = await tx.booking.findUnique({
    where: { id: bookingId },
    include: { bookingItems: true },
  });
  if (!booking || booking.status === "returned" || booking.status === "cancelled" || booking.status === "incomplete_return") {
    return [];
  }

  const delivered = booking.bookingItems.filter((bi) => bi.isDelivered && !bi.isCancelled);
  if (!delivered.length) return [];

  // Partial delivery: keep booking open so remaining dresses can still be handed over.
  const undelivered = booking.bookingItems.filter((bi) => !bi.isDelivered && !bi.isCancelled);
  if (undelivered.length > 0) return [];

  const allReturned = delivered.every((bi) => bi.isReturned);
  const anyIncomplete = delivered.some((bi) => bi.isIncompleteReturn);
  if (!allReturned || anyIncomplete) return [];

  const paths = collectFullReturnPhotoPaths(booking);
  await tx.booking.update({
    where: { id: bookingId },
    data: {
      status: "returned",
      returnedAt: booking.returnedAt || new Date(),
      securityHeld: 0,
      incompletePhoto: null,
      incompleteNotes: null,
      idPhoto1: null,
      idPhoto2: null,
    },
  });
  return paths;
}

/** After an incomplete dress is returned, recalculate held security or close the booking. */
async function syncIncompleteReturnStatus(
  bookingId: number,
  tx: Prisma.TransactionClient,
): Promise<string[]> {
  const booking = await tx.booking.findUnique({
    where: { id: bookingId },
    include: { bookingItems: true },
  });
  if (!booking || booking.status !== "incomplete_return") return [];

  const delivered = booking.bookingItems.filter((bi) => bi.isDelivered);
  const incomplete = delivered.filter((bi) => bi.isIncompleteReturn);
  const totalSecurityHeld = incomplete.reduce((s, bi) => s + (bi.itemSecurityHeld || 0), 0);

  if (incomplete.length === 0) {
    const allReturned = delivered.length > 0 && delivered.every((bi) => bi.isReturned);
    if (allReturned) {
      const paths = collectFullReturnPhotoPaths(booking);
      await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: "returned",
          securityHeld: 0,
          incompletePhoto: null,
          incompleteNotes: null,
          idPhoto1: null,
          idPhoto2: null,
        },
      });
      return paths;
    }
    await tx.booking.update({
      where: { id: bookingId },
      data: { securityHeld: 0 },
    });
    return [];
  }

  const noteParts = incomplete
    .map((bi) => {
      const notes = bi.itemIncompleteNotes?.trim();
      return notes ? `${bi.dressName}: ${notes}` : null;
    })
    .filter(Boolean);

  await tx.booking.update({
    where: { id: bookingId },
    data: {
      securityHeld: totalSecurityHeld,
      incompleteNotes: noteParts.length ? noteParts.join(" | ") : booking.incompleteNotes,
    },
  });
  return [];
}

function warnFromBooking(b: {
  customerName: string;
  monthlySerial: number;
  deliveryDate: Date;
  returnDate: Date;
  deliveryTime: string;
  returnTime: string;
  venue: string | null;
  contact1: string | null;
  totalPrice: number;
  price: number;
}) {
  return {
    customer: b.customerName,
    serial_no: b.monthlySerial,
    delivery_date: formatDate(b.deliveryDate, "display"),
    return_date: formatDate(b.returnDate, "display"),
    delivery_time: b.deliveryTime,
    return_time: b.returnTime,
    venue: b.venue || "",
    contact: b.contact1 || "",
    total_rent: b.totalPrice || b.price,
  };
}

type BookingForPackingRecord = Parameters<typeof serializeStandardBookingDetails>[0] & {
  id: number;
  monthlySerial: number;
  contact1?: string | null;
  whatsappNo?: string | null;
  venue?: string | null;
  staffNames?: string | null;
  totalAdvance?: number;
  advance?: number;
};

function packingRecordFromBooking(b: BookingForPackingRecord) {
  const std = serializeStandardBookingDetails(b);
  return {
    id: b.id,
    serial_no: b.monthlySerial,
    contact_1: b.contact1 || "",
    whatsapp_no: b.whatsappNo || "",
    venue: b.venue || "",
    staff_names: b.staffNames || "",
    total_advance: b.totalAdvance ?? b.advance ?? 0,
    ...std,
  };
}

function packingWarningFromBooking(b: BookingForPackingRecord) {
  return bookingWarningRecordFrom(b);
}

export async function getDashboardFreeItems(deliveryDateStr: string, returnDateStr: string, categoryFilter = "", subCategoryFilter = "") {
  if (!deliveryDateStr || !returnDateStr) {
    return { free_items: [], returning_on_delivery: [], warnings: {} };
  }

  const dDate = parseDateQ(deliveryDateStr);
  const rDate = parseDateQ(returnDateStr);

  const [allItems, overlapWhere] = await Promise.all([
    prisma.clothingItem.findMany({
      where: {
        status: { not: "maintenance" },
        ...(categoryFilter ? { category: categoryFilter } : {}),
        ...(subCategoryFilter ? { subCategory: subCategoryFilter } : {}),
      },
      select: { id: true, name: true, category: true, subCategory: true, color: true, size: true },
    }),
    whereBookingOverlapsPeriod(deliveryDateStr, returnDateStr),
  ]);
  const returningOnDeliveryWhere = await whereReturnInRange(deliveryDateStr, deliveryDateStr);
  const deliveryOnReturnWhere = await whereDeliveryInRange(returnDateStr, returnDateStr);

  // Peak concurrency ≤2 under connection_limit=3.
  const [overlappingBookings, overlappingRentals] = await Promise.all([
    prisma.booking.findMany({
      where: {
        status: { in: ["booked", "delivered"] },
        ...overlapWhere,
      },
      select: {
        itemId: true,
        bookingItems: { select: { itemId: true } },
      },
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
  const [returningOnDeliveryBookings, bookingsOnReturnDate] = await Promise.all([
    prisma.booking.findMany({
      where: { status: { in: ["booked", "delivered"] }, ...returningOnDeliveryWhere },
      select: {
        itemId: true,
        dressName: true,
        bookingNumber: true,
        monthlySerial: true,
        customerName: true,
        contact1: true,
        totalPrice: true,
        price: true,
        returnTime: true,
        returnDate: true,
        venue: true,
        bookingItems: { select: { itemId: true, dressName: true, category: true } },
      },
    }),
    prisma.booking.findMany({
      where: { status: { in: ["booked", "delivered"] }, ...deliveryOnReturnWhere },
      select: {
        itemId: true,
        bookingNumber: true,
        monthlySerial: true,
        customerName: true,
        totalPrice: true,
        price: true,
        deliveryTime: true,
        venue: true,
        bookingItems: { select: { itemId: true } },
      },
    }),
  ]);

  const bookedItemIds = new Set<number>();
  for (const b of overlappingBookings) {
    if (b.bookingItems.length) {
      b.bookingItems.forEach((bi) => {
        if (bi.itemId != null) bookedItemIds.add(bi.itemId);
      });
    }
    else if (b.itemId) bookedItemIds.add(b.itemId);
  }

  const rentedItemIds = new Set<number>();
  for (const r of overlappingRentals) {
    r.items.forEach((ri) => {
      if (ri.itemId != null) rentedItemIds.add(ri.itemId);
    });
  }

  const busyIds = new Set([...bookedItemIds, ...rentedItemIds]);

  const returningOnDeliveryIds = new Set<number>();
  for (const b of returningOnDeliveryBookings) {
    if (b.bookingItems.length) {
      b.bookingItems.forEach((bi) => {
        if (bi.itemId != null) returningOnDeliveryIds.add(bi.itemId);
      });
    }
    else if (b.itemId) returningOnDeliveryIds.add(b.itemId);
  }
  const bookedOnReturnIds = new Set<number>();
  const bookedOnReturnInfo: Record<string, object> = {};
  for (const b of bookingsOnReturnDate) {
    const ids = b.bookingItems.length
      ? b.bookingItems.map((bi) => bi.itemId).filter((id): id is number => id != null)
      : b.itemId ? [b.itemId] : [];
    for (const bid of ids) {
      bookedOnReturnIds.add(bid);
      bookedOnReturnInfo[String(bid)] = {
        booking_number: b.bookingNumber,
        serial_no: b.monthlySerial,
        customer_name: b.customerName,
        amount: b.totalPrice || b.price,
        delivery_time: b.deliveryTime,
        venue: b.venue || "",
      };
    }
  }

  const trulyBusy = new Set([...busyIds].filter((id) => !returningOnDeliveryIds.has(id) && !bookedOnReturnIds.has(id)));

  const free_items = [];
  const warnings: Record<string, object> = {};
  for (const i of allItems) {
    if (!trulyBusy.has(i.id)) {
      free_items.push({
        id: i.id,
        name: i.name,
        display_name: dressDisplayName(i.name, i.category, i.size),
        category: i.category,
        sub_category: i.subCategory || "",
        color: i.color || "",
        size: i.size || "",
      });
      if (bookedOnReturnInfo[String(i.id)]) warnings[String(i.id)] = bookedOnReturnInfo[String(i.id)];
    }
  }

  const returning_on_delivery = [];
  const returnItemIds = new Set<number>();
  for (const b of returningOnDeliveryBookings) {
    if (b.bookingItems.length) {
      b.bookingItems.forEach((bi) => {
        if (bi.itemId != null) returnItemIds.add(bi.itemId);
      });
    }
    else if (b.itemId) returnItemIds.add(b.itemId);
  }
  const returnItemsById = new Map(
    (await prisma.clothingItem.findMany({ where: { id: { in: [...returnItemIds] } } })).map((i) => [i.id, i])
  );

  for (const b of returningOnDeliveryBookings) {
    const itemsInB = b.bookingItems.length
      ? b.bookingItems
          .filter((bi) => bi.itemId != null)
          .map((bi) => ({ id: bi.itemId as number, name: bi.dressName, cat: bi.category || "" }))
      : b.itemId ? [{ id: b.itemId, name: b.dressName || "", cat: "" }] : [];
    for (const { id: bid, name: bname, cat: bcat } of itemsInB) {
      const item = returnItemsById.get(bid);
      const cat = bcat || item?.category || "";
      if (categoryFilter && cat !== categoryFilter) continue;
      returning_on_delivery.push({
        id: bid,
        dress_name: bname,
        display_name: dressDisplayName(bname, cat, item?.size),
        category: cat,
        booking_number: b.bookingNumber,
        serial_no: b.monthlySerial,
        customer_name: b.customerName,
        contact: b.contact1,
        amount: b.totalPrice || b.price,
        return_time: b.returnTime,
        return_date: formatDate(b.returnDate, "display"),
        venue: b.venue || "",
      });
    }
  }

  return { free_items, returning_on_delivery, warnings };
}

export function getDashboardFreeItemsCached(
  deliveryDateStr: string,
  returnDateStr: string,
  categoryFilter = "",
  subCategoryFilter = "",
) {
  return cachedQuery(
    ["dashboard-free-items", deliveryDateStr, returnDateStr, categoryFilter, subCategoryFilter],
    () => getDashboardFreeItems(deliveryDateStr, returnDateStr, categoryFilter, subCategoryFilter),
    30,
  );
}

export async function bookingDateCheck(
  bookingId: number,
  deliveryDateStr: string,
  returnDateStr: string,
  itemIds: number[]
) {
  if (!deliveryDateStr || !returnDateStr || !itemIds.length) return [];
  const dDateRaw = parseDate(deliveryDateStr);
  const rDateRaw = parseDate(returnDateStr);
  if (rDateRaw < dDateRaw) throw new Error("return before delivery");

  if (!isSqliteDb()) {
    return searchBookingDateCheck({
      bookingId,
      deliveryDate: deliveryDateStr,
      returnDate: returnDateStr,
      itemIds,
    });
  }

  return bookingDateCheckLegacySqlite(bookingId, deliveryDateStr, returnDateStr, itemIds);
}

/** SQLite-only fallback (local dev). PostgreSQL uses single CTE in bookingDateCheckSearch. */
async function bookingDateCheckLegacySqlite(
  bookingId: number,
  deliveryDateStr: string,
  returnDateStr: string,
  itemIds: number[],
) {
  const dIso = deliveryDateStr.slice(0, 10);
  const rIso = returnDateStr.slice(0, 10);
  const excludeId = bookingId > 0 ? bookingId : undefined;
  const uniqueIds = [...new Set(itemIds)];

  const returnOnDeliveryWhere = await whereReturnInRange(dIso, dIso);
  const deliveryOnReturnWhere = await whereDeliveryInRange(rIso, rIso);
  const overlapWhere = await whereBookingOverlapsPeriod(dIso, rIso);

  const [items, overlapBookings] = await Promise.all([
    prisma.clothingItem.findMany({ where: { id: { in: uniqueIds } } }),
    prisma.booking.findMany({
      where: {
        ...overlapWhere,
        ...(excludeId ? { id: { not: excludeId } } : {}),
        status: { in: ["booked", "delivered"] },
        OR: [
          { itemId: { in: uniqueIds } },
          { bookingItems: { some: { itemId: { in: uniqueIds } } } },
        ],
      },
      include: { bookingItems: true },
    }),
  ]);
  const [retWarnBookings, delWarnBookings] = await Promise.all([
    prisma.booking.findMany({
      where: {
        ...(excludeId ? { id: { not: excludeId } } : {}),
        status: { in: ["booked", "delivered"] },
        ...returnOnDeliveryWhere,
        OR: [
          { itemId: { in: uniqueIds } },
          { bookingItems: { some: { itemId: { in: uniqueIds } } } },
        ],
      },
      include: { bookingItems: true },
    }),
    prisma.booking.findMany({
      where: {
        ...(excludeId ? { id: { not: excludeId } } : {}),
        status: { in: ["booked", "delivered"] },
        ...deliveryOnReturnWhere,
        OR: [
          { itemId: { in: uniqueIds } },
          { bookingItems: { some: { itemId: { in: uniqueIds } } } },
        ],
      },
      include: { bookingItems: true },
    }),
  ]);

  const itemsById = new Map(items.map((i) => [i.id, i]));

  function findConflictBooking(itemId: number) {
    for (const b of overlapBookings) {
      const bD = formatDate(b.deliveryDate, "iso");
      const bR = formatDate(b.returnDate, "iso");
      if (bR === dIso || bD === rIso) continue;
      if (bookingUsesItem(b, itemId)) return b;
    }
    return null;
  }

  function findWarningBookings(itemId: number) {
    let retWarn: (typeof retWarnBookings)[number] | null = null;
    for (const b of retWarnBookings) {
      if (bookingUsesItem(b, itemId)) {
        retWarn = b;
        break;
      }
    }
    let delWarn: (typeof delWarnBookings)[number] | null = null;
    for (const b of delWarnBookings) {
      if (bookingUsesItem(b, itemId)) {
        delWarn = b;
        break;
      }
    }
    return { retWarn, delWarn };
  }

  const results = [];
  for (const itemId of itemIds) {
    const item = itemsById.get(itemId);
    if (!item) continue;

    const conflictBooking = findConflictBooking(itemId);
    if (conflictBooking) {
      results.push({
        item_id: itemId,
        item_name: item.name,
        status: "hard_conflict",
        conflict: warnFromBooking(conflictBooking),
      });
      continue;
    }

    const { retWarn, delWarn } = findWarningBookings(itemId);

    if (retWarn || delWarn) {
      results.push({
        item_id: itemId,
        item_name: item.name,
        status: retWarn && delWarn ? "both_warnings" : retWarn ? "returning_warning" : "booked_on_return_warning",
        returning_warning: retWarn ? warnFromBooking(retWarn) : null,
        booked_on_return_warning: delWarn ? warnFromBooking(delWarn) : null,
      });
      continue;
    }

    results.push({ item_id: itemId, item_name: item.name, status: "ok", returning_warning: null, booked_on_return_warning: null });
  }
  return results;
}

export type BookingDateCheckResult = Awaited<ReturnType<typeof bookingDateCheck>>[number];

function itemIdsFromBooking(booking: {
  itemId: number | null;
  bookingItems: Array<{ itemId: number | null }>;
}) {
  const ids = booking.bookingItems.map((bi) => bi.itemId).filter((id): id is number => id != null);
  if (booking.itemId) ids.push(booking.itemId);
  return [...new Set(ids)];
}

/** Availability check before restoring a cancelled booking from recycle bin. */
export async function getBookingRestoreCheck(bookingId: number) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { bookingItems: true },
  });
  if (!booking || booking.status !== "cancelled") {
    throw new Error("Booking not found or not in recycle bin.");
  }

  const deliveryDate = formatDate(booking.deliveryDate, "iso");
  const returnDate = formatDate(booking.returnDate, "iso");
  const itemIds = itemIdsFromBooking(booking);
  const results = await bookingDateCheck(0, deliveryDate, returnDate, itemIds);

  const hardConflicts = results.filter((r) => r.status === "hard_conflict");
  const warnings = results.filter(
    (r) =>
      r.status === "returning_warning" ||
      r.status === "booked_on_return_warning" ||
      r.status === "both_warnings",
  );

  return {
    booking: {
      id: booking.id,
      customer_name: booking.customerName,
      serial: booking.monthlySerial,
      delivery_date: formatDate(booking.deliveryDate, "display"),
      return_date: formatDate(booking.returnDate, "display"),
    },
    results,
    canRestore: hardConflicts.length === 0,
    hasWarnings: warnings.length > 0,
    hardConflicts,
    warnings,
  };
}

export class RestoreAvailabilityError extends Error {
  constructor(
    message: string,
    public readonly check: Awaited<ReturnType<typeof getBookingRestoreCheck>>,
    public readonly code: "hard_conflict" | "warnings_required",
  ) {
    super(message);
    this.name = "RestoreAvailabilityError";
  }
}

export async function getPackingList(deliveryDateStr: string, returnDateStr: string, categoryFilter = "") {
  const where: Prisma.BookingWhereInput = { status: "booked" };
  if (deliveryDateStr) {
    Object.assign(where, await whereDeliveryInRange(deliveryDateStr, returnDateStr || deliveryDateStr));
  }

  const bookings = await prisma.booking.findMany({
    where,
    select: {
      id: true,
      monthlySerial: true,
      customerName: true,
      contact1: true,
      whatsappNo: true,
      deliveryDate: true,
      deliveryTime: true,
      returnDate: true,
      returnTime: true,
      venue: true,
      totalPrice: true,
      totalAdvance: true,
      totalRemaining: true,
      commonNotes: true,
      status: true,
      itemId: true,
      dressName: true,
      price: true,
      advance: true,
      remaining: true,
      notes: true,
      bookingItems: {
        select: {
          id: true,
          itemId: true,
          dressName: true,
          category: true,
          size: true,
          price: true,
          advance: true,
          remaining: true,
          notes: true,
          preparedBy: true,
          checkedBy: true,
          isPackedReady: true,
          packingNote: true,
          item: {
            select: {
              photo: true,
              size: true,
            },
          },
        },
      },
      orders: {
        where: { status: "active" },
        select: {
          id: true,
          description: true,
          cost: true,
          advance: true,
          balance: true,
          photo: true,
          deliveryDate: true,
          deliveryTime: true,
          status: true,
        },
        orderBy: { deliveryDate: "asc" },
      },
      legacyItem: { select: { size: true, category: true } },
    },
    orderBy: [{ deliveryDate: "asc" }, { deliveryTime: "asc" }],
  });

  const deliveryDateStrs = [...new Set(bookings.map((b) => formatDate(b.deliveryDate, "iso")))];
  type ReturningBooking = {
    id: number;
    itemId: number | null;
    returnDate: Date;
    customerName: string;
    monthlySerial: number;
    deliveryDate: Date;
    deliveryTime: string;
    returnTime: string;
    venue: string | null;
    totalPrice: number;
    contact1: string;
    bookingItems: { itemId: number | null }[];
  };
  const returningByDeliveryDate = new Map<number, ReturningBooking[]>();
  if (deliveryDateStrs.length) {
    const returningBookings = await prisma.booking.findMany({
      where: {
        ...(await whereReturnOnAnyDates(deliveryDateStrs)),
        status: { in: ["booked", "delivered"] },
      },
      select: {
        id: true,
        itemId: true,
        returnDate: true,
        customerName: true,
        monthlySerial: true,
        deliveryDate: true,
        deliveryTime: true,
        returnTime: true,
        venue: true,
        totalPrice: true,
        contact1: true,
        bookingItems: { select: { itemId: true } },
      },
    });
    for (const rb of returningBookings) {
      const key = rb.returnDate.getTime();
      if (!returningByDeliveryDate.has(key)) returningByDeliveryDate.set(key, []);
      returningByDeliveryDate.get(key)!.push(rb);
    }
  }

  const results = [];
  for (const b of bookings) {
    const items_data = [];
    const returning = (returningByDeliveryDate.get(b.deliveryDate.getTime()) || []).filter((rb) => rb.id !== b.id);
    if (b.bookingItems.length) {
      for (const bi of b.bookingItems) {
        if (categoryFilter && bi.category !== categoryFilter) continue;
        const itemObj = bi.item;
        let retWarning = null;
        for (const rb of returning) {
          const rbIds = rb.bookingItems.length ? rb.bookingItems.map((rbi) => rbi.itemId) : rb.itemId ? [rb.itemId] : [];
          if (rbIds.includes(bi.itemId)) {
            retWarning = packingWarningFromBooking(rb as unknown as BookingForPackingRecord);
            break;
          }
        }
        items_data.push({
          bi_id: bi.id,
          dress_name: bi.dressName,
          display_name: dressDisplayName(bi.dressName, bi.category, bookingItemSize(bi)),
          category: bi.category || "",
          size: bookingItemSize(bi),
          price: bi.price,
          advance: bi.advance,
          remaining: bi.remaining,
          notes: bi.notes || "",
          photo: itemObj ? catalogPhotoRef(itemObj) : "",
          prepared_by: bi.preparedBy || "",
          checked_by: bi.checkedBy || "",
          is_packed_ready: bi.isPackedReady,
          packing_note: bi.packingNote || "",
          returning_warning: retWarning,
        });
      }
    } else if (b.dressName && !categoryFilter) {
      items_data.push({
        bi_id: null,
        dress_name: b.dressName,
        category: "",
        size: "",
        price: b.price,
        advance: b.advance,
        remaining: b.remaining,
        notes: b.notes || "",
        photo: "",
        prepared_by: "",
        checked_by: "",
        is_packed_ready: false,
        packing_note: "",
        returning_warning: null,
      });
    }
    const orders_data = serializeActiveOrders(b.orders);
    if (!items_data.length && !(orders_data.length && !categoryFilter)) continue;
    results.push({
      ...packingRecordFromBooking(b),
      items: items_data,
      orders: categoryFilter ? [] : orders_data,
    });
  }
  results.sort((a, b) => Number(b.is_star) - Number(a.is_star));
  return results;
}

export function getPackingListCached(deliveryDateStr: string, returnDateStr: string, categoryFilter = "") {
  return unstable_cache(
    () => getPackingList(deliveryDateStr, returnDateStr, categoryFilter),
    ["packing-list", deliveryDateStr, returnDateStr, categoryFilter],
    { revalidate: 30, tags: ["packing-list"] },
  )();
}

export async function savePackingItem(
  data: {
    bi_id: number;
    prepared_by?: string;
    checked_by?: string;
    is_packed_ready?: boolean;
    packing_note?: string;
  },
  by?: string,
) {
  const bi = await prisma.bookingItem.findUnique({
    where: { id: data.bi_id },
    select: {
      id: true,
      bookingId: true,
      dressName: true,
      preparedBy: true,
      checkedBy: true,
      isPackedReady: true,
      packingNote: true,
    },
  });
  if (!bi) throw new Error("Item not found");
  const beforePacking = { preparedBy: bi.preparedBy, checkedBy: bi.checkedBy, isPackedReady: bi.isPackedReady, packingNote: bi.packingNote };
  const update: Prisma.BookingItemUpdateInput = {};
  if (data.prepared_by !== undefined && (data.prepared_by.trim() || null) !== bi.preparedBy) {
    update.preparedBy = data.prepared_by.trim() || null;
  }
  if (data.checked_by !== undefined && (data.checked_by.trim() || null) !== bi.checkedBy) {
    update.checkedBy = data.checked_by.trim() || null;
  }
  if (data.is_packed_ready !== undefined && Boolean(data.is_packed_ready) !== bi.isPackedReady) {
    update.isPackedReady = Boolean(data.is_packed_ready);
  }
  if (data.packing_note !== undefined && (data.packing_note.trim() || null) !== bi.packingNote) {
    update.packingNote = data.packing_note.trim() || null;
  }
  if (!Object.keys(update).length) {
    return {
      ok: true,
      prepared_by: bi.preparedBy || "",
      checked_by: bi.checkedBy || "",
      is_packed_ready: bi.isPackedReady,
      packing_note: bi.packingNote || "",
    };
  }
  const updated = await prisma.bookingItem.update({
    where: { id: data.bi_id },
    data: update,
    select: {
      preparedBy: true,
      checkedBy: true,
      isPackedReady: true,
      packingNote: true,
    },
  });
  revalidateTag("packing-list");
  broadcastShopEvent({ type: "packing.updated", bookingId: bi.bookingId, by });
  logActivity({
    username: by || "system",
    action: "packed",
    entity: "booking_item",
    entityId: bi.bookingId,
    label: `Packing update — ${bi.dressName} (Booking #${bi.bookingId})`,
    before: beforePacking as unknown as Record<string, unknown>,
    after: { preparedBy: updated.preparedBy, checkedBy: updated.checkedBy, isPackedReady: updated.isPackedReady, packingNote: updated.packingNote } as unknown as Record<string, unknown>,
  });
  return {
    ok: true,
    prepared_by: updated.preparedBy || "",
    checked_by: updated.checkedBy || "",
    is_packed_ready: updated.isPackedReady,
    packing_note: updated.packingNote || "",
  };
}

type SaveDeliveryData = {
  remaining_collected?: number;
  security_collected?: number;
  delivery_notes?: string;
  mark_delivered?: boolean;
  payment_mode?: "cash" | "online";
  security_payment_mode?: "cash" | "online";
  items?: Array<{
    booking_item_id: number;
    remaining_collected: number;
    security_collected: number;
    delivery_notes: string;
    mark_delivered?: boolean;
    update_only?: boolean;
  }>;
};

type BookingWithItems = Prisma.BookingGetPayload<{ include: { bookingItems: true } }>;

async function runSaveDeliveryInTx(
  bookingId: number,
  data: SaveDeliveryData,
  tx: Prisma.TransactionClient,
  newlyDeliveredItemIds: number[],
): Promise<{ result: BookingWithItems; beforeSnapshot: Record<string, unknown> }> {
  await tx.$executeRaw`SELECT id FROM bookings WHERE id = ${bookingId} FOR UPDATE`;

  const locked = await tx.booking.findUnique({
    where: { id: bookingId },
    include: { bookingItems: true },
  });
  if (!locked) throw new Error("Booking not found");
  const beforeSnapshot = snapshotBooking(locked as unknown as Record<string, unknown>);

  const resolveRemainingPaymentMode = (totalRemainingCollected: number) =>
    totalRemainingCollected > 0
      ? data.payment_mode === "online"
        ? "online"
        : "cash"
      : locked.remainingPaymentMode;

  const resolveSecurityPaymentMode = (totalSecurityCollected: number) =>
    totalSecurityCollected > 0
      ? data.security_payment_mode === "online"
        ? "online"
        : "cash"
      : locked.securityPaymentMode;

  if (data.items?.length) {
    const itemById = new Map(locked.bookingItems.map((bi) => [bi.id, bi]));
    const deliverIds: number[] = [];

    for (const item of data.items) {
      const bi = itemById.get(item.booking_item_id);
      if (!bi) continue;
      if (item.mark_delivered && !bi.isDelivered && !bi.isCancelled) {
        deliverIds.push(bi.id);
        newlyDeliveredItemIds.push(bi.id);
      }
    }

    if (deliverIds.length) {
      await tx.bookingItem.updateMany({
        where: { id: { in: deliverIds } },
        data: { isDelivered: true, deliveredAt: new Date() },
      });
    }

    await Promise.all(
      data.items.map((item) => {
        const bi = itemById.get(item.booking_item_id);
        if (!bi) return null;
        return tx.bookingItem.update({
          where: { id: bi.id },
          data: {
            itemRemainingCollected: item.remaining_collected,
            itemSecurityCollected: item.security_collected,
            itemDeliveryNotes: item.delivery_notes?.trim() || null,
          },
        });
      }).filter(Boolean),
    );

    const refreshed = await tx.booking.findUnique({
      where: { id: bookingId },
      include: { bookingItems: true },
    });
    if (!refreshed) throw new Error("Booking not found");

    const totalRemaining = refreshed.bookingItems.reduce((s, bi) => s + bi.itemRemainingCollected, 0);
    const totalSecurity = refreshed.bookingItems.reduce((s, bi) => s + bi.itemSecurityCollected, 0);
    const newNotes = refreshed.bookingItems
      .map((bi) => (bi.itemDeliveryNotes ? `${bi.dressName}: ${bi.itemDeliveryNotes}` : null))
      .filter(Boolean)
      .join(" | ");

    const dressIsOut =
      refreshed.bookingItems.some((bi) => bi.isDelivered && !bi.isCancelled) ||
      refreshed.status === "delivered";
    const nextSecurityHeld =
      locked.status === "incomplete_return"
        ? locked.securityHeld
        : totalSecurity > 0
          ? totalSecurity
          : dressIsOut && locked.securityDeposit > 0
            ? locked.securityDeposit
            : 0;

    const allActiveDelivered =
      refreshed.status === "booked" &&
      refreshed.bookingItems.filter((bi) => !bi.isCancelled).length > 0 &&
      refreshed.bookingItems.filter((bi) => !bi.isCancelled).every((bi) => bi.isDelivered);

    const itemDeliveredAt = refreshed.bookingItems
      .map((bi) => bi.deliveredAt)
      .find((d): d is Date => d != null);

    return {
      result: await tx.booking.update({
        where: { id: bookingId },
        data: {
          remainingCollected: totalRemaining,
          securityCollected: totalSecurity,
          securityHeld: nextSecurityHeld,
          deliveryNotes: newNotes || data.delivery_notes || locked.deliveryNotes,
          remainingPaymentMode: resolveRemainingPaymentMode(totalRemaining),
          securityPaymentMode: resolveSecurityPaymentMode(totalSecurity),
          ...(allActiveDelivered
            ? {
                status: "delivered" as const,
                deliveredAt: refreshed.deliveredAt || itemDeliveredAt || new Date(),
              }
            : {}),
        },
        include: { bookingItems: true },
      }),
      beforeSnapshot,
    };
  }

  if (data.mark_delivered && locked.status === "booked" && locked.bookingItems.length > 0) {
    const toDeliver = locked.bookingItems
      .filter((bi) => !bi.isDelivered && !bi.isCancelled)
      .map((bi) => bi.id);
    newlyDeliveredItemIds.push(...toDeliver);
    if (toDeliver.length) {
      await tx.bookingItem.updateMany({
        where: { id: { in: toDeliver } },
        data: { isDelivered: true, deliveredAt: new Date() },
      });
    }
  }

  const secCollected = data.security_collected ?? locked.securityCollected;
  const dressIsOut = data.mark_delivered || locked.status === "delivered";
  const nextSecurityHeld =
    locked.status === "incomplete_return"
      ? locked.securityHeld
      : secCollected > 0
        ? secCollected
        : dressIsOut && locked.securityDeposit > 0
          ? locked.securityDeposit
          : 0;

  const totalRemainingCollected = data.remaining_collected ?? locked.remainingCollected;

  const bookingFields = {
    remainingCollected: totalRemainingCollected,
    securityCollected: secCollected,
    securityHeld: nextSecurityHeld,
    deliveryNotes: data.delivery_notes ?? locked.deliveryNotes,
    remainingPaymentMode: resolveRemainingPaymentMode(totalRemainingCollected),
    securityPaymentMode: resolveSecurityPaymentMode(secCollected),
  };

  if (data.mark_delivered && locked.status === "booked" && locked.bookingItems.length === 0) {
    return {
      result: await tx.booking.update({
        where: { id: bookingId },
        data: {
          ...bookingFields,
          status: "delivered",
          deliveredAt: locked.deliveredAt || new Date(),
        },
        include: { bookingItems: true },
      }),
      beforeSnapshot,
    };
  }

  const updated = await tx.booking.update({
    where: { id: bookingId },
    data: bookingFields,
    include: { bookingItems: true },
  });

  if (updated.status !== "booked") {
    return { result: updated, beforeSnapshot };
  }

  const activeItems = updated.bookingItems.filter((bi) => !bi.isCancelled);
  if (!activeItems.length || !activeItems.every((bi) => bi.isDelivered)) {
    return { result: updated, beforeSnapshot };
  }

  const itemDeliveredAt = activeItems.map((bi) => bi.deliveredAt).find((d): d is Date => d != null);
  return {
    result: await tx.booking.update({
      where: { id: bookingId },
      data: {
        status: "delivered",
        deliveredAt: updated.deliveredAt || itemDeliveredAt || new Date(),
      },
      include: { bookingItems: true },
    }),
    beforeSnapshot,
  };
}

export async function saveDelivery(
  bookingId: number,
  data: SaveDeliveryData,
  by?: string,
  options?: { tx?: Prisma.TransactionClient },
) {
  let beforeDelivery: Record<string, unknown> | null = null;
  let labelBooking: BookingWithItems | null = null;

  if (!options?.tx) {
    const pre = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { bookingItems: true },
    });
    if (!pre) throw new Error("Booking not found");
    beforeDelivery = snapshotBooking(pre as unknown as Record<string, unknown>);
    labelBooking = pre;
  }

  const newlyDeliveredItemIds: number[] = [];

  const execute = async (tx: Prisma.TransactionClient) =>
    runSaveDeliveryInTx(bookingId, data, tx, newlyDeliveredItemIds);

  const { result, beforeSnapshot: txBefore } = options?.tx
    ? await execute(options.tx)
    : await prisma.$transaction(execute);

  if (!beforeDelivery) beforeDelivery = txBefore;
  if (!labelBooking) labelBooking = result;

  // Nested in outer mutation tx — caller owns post-commit side effects.
  if (options?.tx) {
    return Object.assign(result, {
      newlyDeliveredItemIds,
      deferSideEffects: true as const,
    });
  }

  broadcastShopEvent({ type: "booking.delivered", bookingId, status: result.status, by });
  const deliveryDresses =
    labelBooking.bookingItems.map((bi) => bi.dressName).filter(Boolean).join(", ") ||
    labelBooking.dressName ||
    "";
  void logActivity({
    username: by || "system",
    action: "delivered",
    entity: "booking",
    entityId: bookingId,
    label: `Delivery — Booking #${String(labelBooking.monthlySerial).padStart(2, "0")} — ${labelBooking.customerName}${deliveryDresses ? ` (${deliveryDresses})` : ""}`,
    before: beforeDelivery ?? snapshotBooking(result as unknown as Record<string, unknown>),
    after: snapshotBooking(result as unknown as Record<string, unknown>),
  });
  return Object.assign(result, { newlyDeliveredItemIds });
}

export async function saveDeliveryIdPhotos(
  bookingId: number,
  data: { id_photo_1?: File | null; id_photo_2?: File | null },
  by?: string,
) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throw new Error("Booking not found");

  let idPhoto1 = booking.idPhoto1;
  let idPhoto2 = booking.idPhoto2;
  const pathsToCleanup: string[] = [];
  let partialFailure: { slot: 1 | 2; code: string; message: string } | undefined;

  const file1 = data.id_photo_1;
  const file2 = data.id_photo_2;
  const isUpload = (f: unknown): f is File =>
    Boolean(f) && typeof f === "object" && "size" in (f as object) && (f as File).size > 0;

  if (isUpload(file1)) {
    idPhoto1 = await saveIdProofUpload(file1);
    if (booking.idPhoto1 && booking.idPhoto1 !== idPhoto1) {
      pathsToCleanup.push(booking.idPhoto1);
    }
  }

  if (isUpload(file2)) {
    try {
      const uploaded = await saveIdProofUpload(file2);
      if (booking.idPhoto2 && booking.idPhoto2 !== uploaded) {
        pathsToCleanup.push(booking.idPhoto2);
      }
      idPhoto2 = uploaded;
    } catch (e) {
      if (e instanceof IdProofUploadError && isUpload(file1) && idPhoto1 !== booking.idPhoto1) {
        partialFailure = { slot: 2, code: e.code, message: e.message };
      } else {
        if (isUpload(file1) && idPhoto1 !== booking.idPhoto1) {
          await deleteUpload(idPhoto1);
          idPhoto1 = booking.idPhoto1;
        }
        throw e;
      }
    }
  }

  if (idPhoto1 === booking.idPhoto1 && idPhoto2 === booking.idPhoto2) {
    throw new Error("No ID photo files were received. Try capturing again and Save ID Photos.");
  }

  const result = await prisma.booking.update({
    where: { id: bookingId },
    data: { idPhoto1, idPhoto2 },
  });

  if (idPhoto1 && idPhoto1 !== booking.idPhoto1) {
    await trackBookingPrivateMedia({
      bookingId,
      blobUrl: idPhoto1,
      mediaType: BOOKING_PRIVATE_MEDIA_TYPES.ID_PROOF,
    });
  }
  if (idPhoto2 && idPhoto2 !== booking.idPhoto2) {
    await trackBookingPrivateMedia({
      bookingId,
      blobUrl: idPhoto2,
      mediaType: BOOKING_PRIVATE_MEDIA_TYPES.ID_PROOF,
    });
  }

  if (pathsToCleanup.length) {
    const { enqueueBlobCleanup } = await import("@/lib/blobCleanup");
    await enqueueBlobCleanup(pathsToCleanup, { reason: "replace_id_photos", bookingId });
  }

  logActivity({
    username: by || "system",
    action: "updated",
    entity: "booking",
    entityId: bookingId,
    label: `ID photos — Booking #${String(booking.monthlySerial).padStart(2, "0")} — ${booking.customerName}`,
    before: { idPhoto1: booking.idPhoto1, idPhoto2: booking.idPhoto2 },
    after: { idPhoto1: result.idPhoto1, idPhoto2: result.idPhoto2 },
  });

  return { booking: result, partialFailure };
}

type SaveReturnData = {
  booking_item_id?: number;
  booking_item_ids?: number[];
  incomplete_notes?: string;
  security_held?: number;
  incomplete_photo?: string;
  items?: Array<{
    booking_item_id: number;
    is_incomplete: boolean;
    incomplete_notes?: string;
    security_held?: number;
    incomplete_photo?: string;
  }>;
};

async function runInReturnTx<T>(
  tx: Prisma.TransactionClient | undefined,
  fn: (client: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  if (tx) return fn(tx);
  return prisma.$transaction(fn);
}

function validateReturnableItem(
  bi: BookingWithItems["bookingItems"][number],
  label?: string,
) {
  const name = label ?? `"${bi.dressName}"`;
  if (!bi.isDelivered) throw new Error(`${name} must be delivered before it can be returned.`);
  if (bi.isCancelled) throw new Error(`${name} is cancelled and cannot be returned.`);
  if (bi.isReturned && !bi.isIncompleteReturn) {
    throw new Error(`${name} is already marked returned.`);
  }
}

async function runMarkItemReturnedInTx(
  bookingId: number,
  itemId: number,
  tx: Prisma.TransactionClient,
): Promise<{
  booking: BookingWithItems | null;
  newlyReturnedItemIds: number[];
  pathsToCleanup: string[];
}> {
  await tx.$executeRaw`SELECT id FROM bookings WHERE id = ${bookingId} FOR UPDATE`;
  const locked = await tx.booking.findUnique({
    where: { id: bookingId },
    include: { bookingItems: true },
  });
  if (!locked) throw new Error("Booking not found");

  const bi = locked.bookingItems.find((row) => row.id === itemId);
  if (!bi) throw new Error("Dress not found on this booking.");
  validateReturnableItem(bi, "Dress");

  const pathsToCleanup: string[] = [];
  if (bi.isIncompleteReturn && bi.itemIncompletePhoto) {
    pathsToCleanup.push(bi.itemIncompletePhoto);
  }

  if (bi.isIncompleteReturn) {
    await tx.bookingItem.updateMany({
      where: { id: bi.id },
      data: {
        isReturned: true,
        isIncompleteReturn: false,
        itemIncompleteNotes: null,
        itemIncompletePhoto: null,
        itemSecurityHeld: 0,
      },
    });
    pathsToCleanup.push(...(await syncIncompleteReturnStatus(bookingId, tx)));
  } else {
    await tx.bookingItem.updateMany({
      where: { id: bi.id },
      data: { isReturned: true, isIncompleteReturn: false },
    });
    pathsToCleanup.push(...(await finalizeFullReturnIfComplete(bookingId, tx)));
  }

  if (bi.itemId != null) {
    await tx.clothingItem.updateMany({
      where: { id: bi.itemId },
      data: { status: "available" },
    });
  }

  const booking = await tx.booking.findUnique({
    where: { id: bookingId },
    include: { bookingItems: true },
  });
  return { booking, newlyReturnedItemIds: [bi.id], pathsToCleanup };
}

async function runMarkItemsReturnedInTx(
  bookingId: number,
  ids: number[],
  tx: Prisma.TransactionClient,
): Promise<{
  booking: BookingWithItems | null;
  newlyReturnedItemIds: number[];
  pathsToCleanup: string[];
}> {
  await tx.$executeRaw`SELECT id FROM bookings WHERE id = ${bookingId} FOR UPDATE`;
  const locked = await tx.booking.findUnique({
    where: { id: bookingId },
    include: { bookingItems: true },
  });
  if (!locked) throw new Error("Booking not found");

  const itemById = new Map(locked.bookingItems.map((bi) => [bi.id, bi]));
  const toReturn: BookingWithItems["bookingItems"] = [];
  for (const id of ids) {
    const bi = itemById.get(id);
    if (!bi) throw new Error("Dress not found on this booking.");
    validateReturnableItem(bi);
    toReturn.push(bi);
  }

  const pathsToCleanup = toReturn
    .filter((bi) => bi.isIncompleteReturn && bi.itemIncompletePhoto)
    .map((bi) => bi.itemIncompletePhoto as string);

  const incompleteIds = toReturn.filter((bi) => bi.isIncompleteReturn).map((bi) => bi.id);
  const normalIds = toReturn.filter((bi) => !bi.isIncompleteReturn).map((bi) => bi.id);

  if (incompleteIds.length) {
    await tx.bookingItem.updateMany({
      where: { id: { in: incompleteIds } },
      data: {
        isReturned: true,
        isIncompleteReturn: false,
        itemIncompleteNotes: null,
        itemIncompletePhoto: null,
        itemSecurityHeld: 0,
      },
    });
  }
  if (normalIds.length) {
    await tx.bookingItem.updateMany({
      where: { id: { in: normalIds } },
      data: { isReturned: true, isIncompleteReturn: false },
    });
  }

  const clothingIds = toReturn
    .map((bi) => bi.itemId)
    .filter((id): id is number => id != null);
  if (clothingIds.length) {
    await tx.clothingItem.updateMany({
      where: { id: { in: clothingIds } },
      data: { status: "available" },
    });
  }

  pathsToCleanup.push(...(await syncIncompleteReturnStatus(bookingId, tx)));
  pathsToCleanup.push(...(await finalizeFullReturnIfComplete(bookingId, tx)));

  const booking = await tx.booking.findUnique({
    where: { id: bookingId },
    include: { bookingItems: true },
  });
  return { booking, newlyReturnedItemIds: toReturn.map((bi) => bi.id), pathsToCleanup };
}

export async function saveReturn(
  bookingId: number,
  action: string,
  data: SaveReturnData,
  by?: string,
  options?: { tx?: Prisma.TransactionClient },
) {
  let booking: BookingWithItems | null = null;
  let newlyReturnedItemIds: number[] = [];
  const loadBooking = async (): Promise<BookingWithItems> => {
    if (booking) return booking;
    const client = options?.tx ?? prisma;
    const row = await client.booking.findUnique({
      where: { id: bookingId },
      include: { bookingItems: true },
    });
    if (!row) throw new Error("Booking not found");
    booking = row;
    return row;
  };

  if (!options?.tx) {
    booking = await loadBooking();
  }

  if (action === "mark_returned") {
    const pre = await loadBooking();
    if (pre.status === "incomplete_return") {
      return resolveIncompleteReturn(bookingId, by, options);
    }

    const txResult = await runInReturnTx(options?.tx, async (tx) => {
      await tx.$executeRaw`SELECT id FROM bookings WHERE id = ${bookingId} FOR UPDATE`;
      const locked = await tx.booking.findUnique({
        where: { id: bookingId },
        include: { bookingItems: true },
      });
      if (!locked) throw new Error("Booking not found");

      const toReturn = locked.bookingItems.filter(
        (bi) => bi.isDelivered && !bi.isReturned && !bi.isCancelled,
      );
      const ids = toReturn.map((bi) => bi.id);
      const clothingIds = toReturn
        .map((bi) => bi.itemId)
        .filter((id): id is number => id != null);

      if (ids.length) {
        await tx.bookingItem.updateMany({
          where: { id: { in: ids } },
          data: { isReturned: true },
        });
      }
      if (clothingIds.length) {
        await tx.clothingItem.updateMany({
          where: { id: { in: clothingIds } },
          data: { status: "available" },
        });
      }

      const stillUndelivered = locked.bookingItems.filter((bi) => !bi.isDelivered && !bi.isCancelled);
      const photosToClear =
        stillUndelivered.length === 0
          ? [locked.incompletePhoto, locked.idPhoto1, locked.idPhoto2]
          : [];

      let result: BookingWithItems | null;
      if (stillUndelivered.length === 0) {
        result = await tx.booking.update({
          where: { id: bookingId },
          data: {
            status: "returned",
            returnedAt: new Date(),
            securityHeld: 0,
            incompletePhoto: null,
            incompleteNotes: null,
            idPhoto1: null,
            idPhoto2: null,
          },
          include: { bookingItems: true },
        });
      } else {
        result = await tx.booking.findUnique({
          where: { id: bookingId },
          include: { bookingItems: true },
        });
      }

      return { result, newlyReturnedItemIds: ids, photosToClear };
    });

    if (!options?.tx && txResult.photosToClear.length) {
      const { enqueueBlobCleanup } = await import("@/lib/blobCleanup");
      await enqueueBlobCleanup(txResult.photosToClear, { reason: "full_return", bookingId });
    }

    const finalBooking = txResult.result;
    const labelBooking = booking ?? finalBooking;
    if (options?.tx) {
      return finalBooking
        ? Object.assign(finalBooking, {
            newlyReturnedItemIds: txResult.newlyReturnedItemIds,
            deferSideEffects: true as const,
            photosToClear: txResult.photosToClear,
          })
        : finalBooking;
    }
    if (finalBooking && labelBooking) {
      broadcastShopEvent({ type: "booking.returned", bookingId, status: finalBooking.status, by });
      void logActivity({
        username: by || "system",
        action: "returned",
        entity: "booking",
        entityId: bookingId,
        label: `Return — Booking #${String(labelBooking.monthlySerial).padStart(2, "0")}`,
      });
    }
    return finalBooking
      ? Object.assign(finalBooking, { newlyReturnedItemIds: txResult.newlyReturnedItemIds })
      : finalBooking;
  }

  if (action === "mark_item_returned") {
    if (!data.booking_item_id) {
      const b = await loadBooking();
      if (!b.bookingItems.length) {
        const photosToClear = [b.idPhoto1, b.idPhoto2].filter((p): p is string => !!p);
        const legacyBooking = await runInReturnTx(options?.tx, async (tx) => {
          await tx.$executeRaw`SELECT id FROM bookings WHERE id = ${bookingId} FOR UPDATE`;
          await tx.booking.update({
            where: { id: bookingId },
            data: {
              status: "returned",
              returnedAt: new Date(),
              securityHeld: 0,
              idPhoto1: null,
              idPhoto2: null,
            },
          });
          if (b.itemId) {
            await tx.clothingItem.updateMany({
              where: { id: b.itemId },
              data: { status: "available" },
            });
          }
          return tx.booking.findUnique({
            where: { id: bookingId },
            include: { bookingItems: true },
          });
        });

        if (options?.tx) {
          if (!legacyBooking) throw new Error("Booking not found");
          return Object.assign(legacyBooking, {
            newlyReturnedItemIds: [],
            deferSideEffects: true as const,
            photosToClear,
          });
        }

        if (photosToClear.length) {
          const { enqueueBlobCleanup } = await import("@/lib/blobCleanup");
          await enqueueBlobCleanup(photosToClear, { reason: "full_return", bookingId });
        }
      } else {
        throw new Error("Dress not specified.");
      }
    } else {
      const itemId = data.booking_item_id;

      const txResult = await runInReturnTx(options?.tx, (tx) =>
        runMarkItemReturnedInTx(bookingId, itemId, tx),
      );

      newlyReturnedItemIds = txResult.newlyReturnedItemIds;
      if (options?.tx) {
        if (!txResult.booking) throw new Error("Booking not found");
        return Object.assign(txResult.booking, {
          newlyReturnedItemIds,
          deferSideEffects: true as const,
          pathsToCleanup: txResult.pathsToCleanup,
        });
      }

      if (txResult.pathsToCleanup.length) {
        const { enqueueBlobCleanup } = await import("@/lib/blobCleanup");
        await enqueueBlobCleanup(txResult.pathsToCleanup, {
          reason: "clear_incomplete_item_photo",
          bookingId,
        });
      }
    }
  } else if (action === "mark_items_returned") {
    const ids = [...new Set((data.booking_item_ids ?? []).map(Number).filter((id) => id > 0))];
    if (!ids.length) throw new Error("Select at least one dress to return.");

    const txResult = await runInReturnTx(options?.tx, (tx) =>
      runMarkItemsReturnedInTx(bookingId, ids, tx),
    );

    newlyReturnedItemIds = txResult.newlyReturnedItemIds;
    if (options?.tx) {
      if (!txResult.booking) throw new Error("Booking not found");
      return Object.assign(txResult.booking, {
        newlyReturnedItemIds,
        deferSideEffects: true as const,
        pathsToCleanup: txResult.pathsToCleanup,
      });
    }

    if (txResult.pathsToCleanup.length) {
      const { enqueueBlobCleanup } = await import("@/lib/blobCleanup");
      await enqueueBlobCleanup(txResult.pathsToCleanup, {
        reason: "clear_incomplete_item_photo",
        bookingId,
      });
    }
  } else if (action === "resolve_incomplete_return") {
    const resolved = await resolveIncompleteReturn(bookingId, by, options);
    if (!resolved) throw new Error("Booking is not an incomplete return or could not be resolved.");
    return resolved;
  } else if (action === "incomplete_return") {
    const b = await loadBooking();
    // Keep customer ID photos until the booking is fully returned — staff need them on return.

    if (!b.bookingItems.length) {
      await runInReturnTx(options?.tx, async (tx) => {
        await tx.$executeRaw`SELECT id FROM bookings WHERE id = ${bookingId} FOR UPDATE`;
        await tx.booking.update({
          where: { id: bookingId },
          data: {
            status: "incomplete_return",
            incompleteNotes: data.incomplete_notes || "",
            incompletePhoto: data.incomplete_photo || null,
            securityHeld: data.security_held || 0,
            returnedAt: new Date(),
          },
        });
        if (b.itemId) {
          await tx.clothingItem.updateMany({
            where: { id: b.itemId },
            data: { status: "rented" },
          });
        }
      });
    } else {
      const itemPayload = data.items || [];
      const incompleteIds = new Set(
        itemPayload.filter((i) => i.is_incomplete).map((i) => i.booking_item_id),
      );

      if (itemPayload.length > 0 && incompleteIds.size === 0) {
        throw new Error("Select at least one dress for incomplete return.");
      }

      await runInReturnTx(options?.tx, async (tx) => {
        await tx.$executeRaw`SELECT id FROM bookings WHERE id = ${bookingId} FOR UPDATE`;
        const locked = await tx.booking.findUnique({
          where: { id: bookingId },
          include: { bookingItems: true },
        });
        if (!locked) throw new Error("Booking not found");

        let totalSecurityHeld = 0;
        const noteParts: string[] = [];
        let firstPhoto = data.incomplete_photo || null;

        const incompleteUpdates: Array<{
          id: number;
          notes: string | null;
          photo: string | null;
          held: number;
        }> = [];
        const returnedIds: number[] = [];
        const availableClothingIds: number[] = [];

        for (const bi of locked.bookingItems) {
          if (!bi.isDelivered || bi.isCancelled) continue;

          const row = itemPayload.find((i) => i.booking_item_id === bi.id);
          const isIncomplete = itemPayload.length === 0 ? true : Boolean(row?.is_incomplete);

          if (isIncomplete) {
            const held = row?.security_held ?? 0;
            totalSecurityHeld += held;
            const notes = row?.incomplete_notes?.trim() || "";
            if (notes) noteParts.push(`${bi.dressName}: ${notes}`);
            if (row?.incomplete_photo && !firstPhoto) firstPhoto = row.incomplete_photo;
            incompleteUpdates.push({
              id: bi.id,
              notes: notes || null,
              photo: row?.incomplete_photo || null,
              held,
            });
          } else {
            returnedIds.push(bi.id);
            if (bi.itemId != null) availableClothingIds.push(bi.itemId);
          }
        }

        if (returnedIds.length) {
          await tx.bookingItem.updateMany({
            where: { id: { in: returnedIds } },
            data: {
              isReturned: true,
              isIncompleteReturn: false,
              itemIncompleteNotes: null,
              itemIncompletePhoto: null,
              itemSecurityHeld: 0,
            },
          });
        }
        if (availableClothingIds.length) {
          await tx.clothingItem.updateMany({
            where: { id: { in: availableClothingIds } },
            data: { status: "available" },
          });
        }
        if (incompleteUpdates.length) {
          const values = incompleteUpdates.map(
            (r) =>
              Prisma.sql`(${r.id}::int, ${r.notes}, ${r.photo}, ${r.held}::double precision)`,
          );
          await tx.$executeRaw`
            UPDATE booking_items AS bi
            SET
              is_incomplete_return = true,
              is_returned = false,
              item_incomplete_notes = v.notes,
              item_incomplete_photo = v.photo,
              item_security_held = v.held
            FROM (VALUES ${Prisma.join(values)}) AS v(id, notes, photo, held)
            WHERE bi.id = v.id
          `;
        }

        await tx.booking.update({
          where: { id: bookingId },
          data: {
            status: "incomplete_return",
            incompleteNotes: noteParts.length
              ? noteParts.join(" | ")
              : data.incomplete_notes || "",
            incompletePhoto: firstPhoto,
            securityHeld: data.security_held ?? totalSecurityHeld,
            returnedAt: new Date(),
          },
        });
      });
    }
  }

  // When nested in an outer transaction, reread with that client and defer broadcasts.
  if (options?.tx) {
    const updated = await options.tx.booking.findUnique({
      where: { id: bookingId },
      include: { bookingItems: true },
    });
    return updated
      ? Object.assign(updated, {
          newlyReturnedItemIds: newlyReturnedItemIds.length ? newlyReturnedItemIds : [],
          deferSideEffects: true as const,
        })
      : updated;
  }

  const b = await loadBooking();
  const updated = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { bookingItems: true },
  });
  if (updated) {
    broadcastShopEvent({ type: "booking.returned", bookingId, status: updated.status, by });
    const returnDresses =
      b.bookingItems.map((bi) => bi.dressName).filter(Boolean).join(", ") || b.dressName || "";
    logActivity({
      username: by || "system",
      action: "returned",
      entity: "booking",
      entityId: bookingId,
      label: `Return (${action}) — Booking #${String(b.monthlySerial).padStart(2, "0")} — ${b.customerName}${returnDresses ? ` (${returnDresses})` : ""}`,
      before: snapshotBooking(b as unknown as Record<string, unknown>),
      after: snapshotBooking(updated as unknown as Record<string, unknown>),
    });
  }
  return updated
    ? Object.assign(updated, {
        newlyReturnedItemIds: newlyReturnedItemIds.length ? newlyReturnedItemIds : [],
      })
    : updated;
}

export async function resolveIncompleteReturn(
  bookingId: number,
  by?: string,
  options?: { tx?: Prisma.TransactionClient },
) {
  const run = async (tx: Prisma.TransactionClient) => {
    await tx.$executeRaw`SELECT id FROM bookings WHERE id = ${bookingId} FOR UPDATE`;
    const locked = await tx.booking.findUnique({
      where: { id: bookingId },
      include: { bookingItems: true },
    });
    if (!locked || locked.status !== "incomplete_return") {
      return null;
    }

    const eligible = locked.bookingItems.filter(
      (bi) => bi.isDelivered && !bi.isCancelled && (bi.isIncompleteReturn || !bi.isReturned),
    );
    const eligibleIds = eligible.map((bi) => bi.id);
    const clothingIds = eligible
      .map((bi) => bi.itemId)
      .filter((id): id is number => id != null);

    const blobPaths = [
      locked.incompletePhoto,
      locked.idPhoto1,
      locked.idPhoto2,
      ...eligible.map((bi) => bi.itemIncompletePhoto),
    ].filter((p): p is string => !!p);

    if (eligibleIds.length) {
      await tx.bookingItem.updateMany({
        where: { id: { in: eligibleIds } },
        data: {
          isReturned: true,
          isIncompleteReturn: false,
          itemIncompleteNotes: null,
          itemIncompletePhoto: null,
          itemSecurityHeld: 0,
        },
      });
    }
    if (clothingIds.length) {
      await tx.clothingItem.updateMany({
        where: { id: { in: clothingIds } },
        data: { status: "available" },
      });
    }

    if (locked.itemId && !locked.bookingItems.length) {
      await tx.clothingItem.update({
        where: { id: locked.itemId },
        data: { status: "available" },
      });
    }

    const refreshed = await tx.booking.findUnique({
      where: { id: bookingId },
      include: { bookingItems: true },
    });
    if (!refreshed) return null;

    const deliveredActive = refreshed.bookingItems.filter(
      (bi) => bi.isDelivered && !bi.isCancelled,
    );
    const allReturned =
      deliveredActive.length === 0 ||
      deliveredActive.every((bi) => bi.isReturned && !bi.isIncompleteReturn);

    const updated = await tx.booking.update({
      where: { id: bookingId },
      data: {
        ...(allReturned
          ? {
              status: "returned" as const,
              returnedAt: refreshed.returnedAt || new Date(),
              securityHeld: 0,
              incompletePhoto: null,
              incompleteNotes: null,
              idPhoto1: null,
              idPhoto2: null,
            }
          : {
              securityHeld: refreshed.bookingItems
                .filter((bi) => bi.isIncompleteReturn)
                .reduce((s, bi) => s + (bi.itemSecurityHeld || 0), 0),
            }),
      },
      include: { bookingItems: true },
    });

    return Object.assign(updated, {
      newlyReturnedItemIds: eligibleIds,
      blobPathsToCleanup: blobPaths,
      beforeSnapshot: snapshotBooking(locked as unknown as Record<string, unknown>),
    });
  };

  if (options?.tx) {
    return run(options.tx);
  }

  const result = await prisma.$transaction(run);
  if (!result) return null;

  const paths = result.blobPathsToCleanup ?? [];
  if (paths.length) {
    const { enqueueBlobCleanup } = await import("@/lib/blobCleanup");
    await enqueueBlobCleanup(paths, { reason: "resolve_incomplete_return", bookingId });
  }

  broadcastShopEvent({
    type: "booking.returned",
    bookingId,
    status: result.status,
    by,
  });
  void logActivity({
    username: by || "system",
    action: "returned",
    entity: "booking",
    entityId: bookingId,
    label: `Resolved incomplete return — Booking #${String(result.monthlySerial).padStart(2, "0")}`,
    before: result.beforeSnapshot,
    after: snapshotBooking(result as unknown as Record<string, unknown>),
  });

  return result;
}

function alternateBookingSide(
  b: {
    id: number;
    monthlySerial: number;
    customerName: string;
    contact1: string | null;
    whatsappNo: string | null;
    customerAddress: string | null;
    deliveryTime: string;
    deliveryDate: Date;
    returnTime: string;
    returnDate: Date;
    venue: string | null;
    totalPrice: number;
    price: number;
    totalRemaining: number;
    remaining: number;
    remainingCollected: number;
    securityDeposit: number;
    securityCollected: number;
    dressName?: string | null;
    notes?: string | null;
    commonNotes?: string | null;
    bookingItems?: Array<{
      dressName: string;
      category?: string | null;
      size?: string | null;
      notes?: string | null;
      price?: number | null;
      item?: { size?: string | null } | null;
    }>;
    legacyItem?: { category?: string | null; size?: string | null } | null;
  },
  items: string[]
) {
  const std = serializeStandardBookingDetails(b);
  const totalRemaining = b.totalRemaining ?? b.remaining ?? 0;
  const remainingCollected = b.remainingCollected || 0;
  return {
    id: b.id,
    serial: b.monthlySerial,
    customer_name: b.customerName,
    contact_1: b.contact1 || "",
    whatsapp_no: b.whatsappNo || "",
    address: b.customerAddress || "",
    delivery_time: b.deliveryTime,
    delivery_date: formatDate(b.deliveryDate, "iso"),
    return_time: b.returnTime,
    return_date: formatDate(b.returnDate, "iso"),
    venue: b.venue || "",
    total_price: b.totalPrice || b.price || 0,
    total_rent: b.totalPrice || b.price || 0,
    total_remaining: totalRemaining,
    remaining_collected: remainingCollected,
    balance_remaining: Math.max(0, totalRemaining - remainingCollected),
    security_deposit: b.securityDeposit || 0,
    security_collected: b.securityCollected || 0,
    item_notes: std.item_notes,
    common_notes: std.common_notes,
    items,
    is_star: isStarBooking(b),
  };
}

export async function getReturningToday(targetDateStr: string) {
  const dateStr = (targetDateStr || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const [returnWhere, deliveryWhere] = await Promise.all([
    whereReturnInRange(dateStr, dateStr),
    whereDeliveryInRange(dateStr, dateStr),
  ]);

  const returning = await prisma.booking.findMany({
    where: {
      ...returnWhere,
      status: { in: ["booked", "delivered"] },
    },
    include: { bookingItems: { include: { item: true } }, legacyItem: true },
    orderBy: { returnTime: "asc" },
  });

  const candidates = await prisma.booking.findMany({
    where: {
      ...deliveryWhere,
      status: { in: ["booked", "delivered"] },
    },
    include: { bookingItems: { include: { item: true } }, legacyItem: true },
  });

  const data = [];
  const deliveryByItemId = new Map<number, typeof candidates>();
  for (const nxt of candidates) {
    const nxtIds = nxt.bookingItems.length
      ? nxt.bookingItems.map((bi) => bi.itemId).filter((id): id is number => id != null)
      : nxt.itemId
        ? [nxt.itemId]
        : [];
    for (const id of nxtIds) {
      const list = deliveryByItemId.get(id);
      if (list) list.push(nxt);
      else deliveryByItemId.set(id, [nxt]);
    }
  }

  for (const b of returning) {
    const itemRows = serializeBookingItems(b);
    const itemIds = b.bookingItems.length
      ? b.bookingItems.map((bi) => bi.itemId).filter((id): id is number => id != null)
      : b.itemId
        ? [b.itemId]
        : [];

    let next_booking: ReturnType<typeof alternateBookingSide> | null = null;

    for (const id of itemIds) {
      const matches = deliveryByItemId.get(id);
      if (!matches) continue;
      const nxt = matches.find((c) => c.id !== b.id);
      if (!nxt) continue;

      const matchedIds = nxt.bookingItems.length
        ? nxt.bookingItems.map((bi) => bi.itemId).filter((nid): nid is number => nid != null && itemIds.includes(nid))
        : nxt.itemId && itemIds.includes(nxt.itemId)
          ? [nxt.itemId]
          : [];

      const matchedNames = nxt.bookingItems.length
        ? nxt.bookingItems
            .filter((bi): bi is typeof bi & { itemId: number } => bi.itemId != null && matchedIds.includes(bi.itemId))
            .map((bi) => dressDisplayName(bi.dressName, bi.category, bookingItemSize(bi)))
        : itemRows.map((i) => i.display_name || i.name);

      next_booking = alternateBookingSide(nxt, matchedNames);
      break;
    }

    if (!next_booking) continue;

    const returningSide = alternateBookingSide(b, itemRows.map((i) => i.display_name || i.name));
    data.push({
      ...returningSide,
      delivery_notes: b.deliveryNotes || "",
      item_categories: itemRows.map((i) => i.category).filter(Boolean),
      dress_names: itemRows.map((i) => i.display_name || i.name).join(", "),
      next_booking,
    });
  }
  return data;
}

export function getReturningTodayCached(targetDateStr: string) {
  return cachedQuery(
    ["returning-today", targetDateStr.slice(0, 10)],
    () => getReturningToday(targetDateStr),
    30,
  );
}

export async function cancelBooking(bookingId: number, refundAmount = 0, by?: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { bookingItems: true },
  });
  if (!booking) throw new Error("Booking not found");
  await prisma.$transaction(async (tx) => {
    await tx.booking.update({
      where: { id: bookingId },
      data: {
        status: "cancelled",
        refundAmount: refundAmount > 0 ? refundAmount : 0,
        refundedAt: refundAmount > 0 ? new Date() : null,
      },
    });
    const itemIds = booking.bookingItems.map((bi) => bi.itemId).filter((id): id is number => id != null);
    const stillUsed = await findItemIdsStillInActiveBookings(itemIds, bookingId, tx);
    for (const bi of booking.bookingItems) {
      if (bi.itemId != null && !stillUsed.has(bi.itemId)) {
        await tx.clothingItem.update({ where: { id: bi.itemId }, data: { status: "available" } });
      }
    }
  });
  broadcastShopEvent({ type: "booking.cancelled", bookingId, status: "cancelled", by });
  logActivity({
    username: by || "system",
    action: "cancelled",
    entity: "booking",
    entityId: bookingId,
    label: `Cancelled — Booking #${String(booking.monthlySerial).padStart(2, "0")} — ${booking.customerName} (Refund: ₹${refundAmount})`,
    before: snapshotBooking(booking as unknown as Record<string, unknown>),
    after: { status: "cancelled", refundAmount },
  });
}

/** Cancel one dress on a multi-item booking. refundAdvance=true refunds that dress's advance. */
export async function cancelBookingItem(
  bookingId: number,
  bookingItemId: number,
  opts: { refundAdvance: boolean },
  by?: string,
) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { bookingItems: true },
  });
  if (!booking) throw new Error("Booking not found");
  if (booking.status === "cancelled") throw new Error("Booking is already cancelled.");
  if (booking.status === "returned") throw new Error("Cannot cancel a dress on a returned booking.");

  const bi = booking.bookingItems.find((row) => row.id === bookingItemId);
  if (!bi) throw new Error("Dress not found on this booking.");
  if (bi.isCancelled) throw new Error("This dress is already cancelled.");
  if (bi.isDelivered) throw new Error("Cannot cancel a dress that is already delivered. Return it instead.");
  if (bi.isReturned) throw new Error("This dress is already returned.");

  const refundAmt = opts.refundAdvance ? Math.max(0, bi.advance || 0) : 0;
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.bookingItem.update({
      where: { id: bi.id },
      data: {
        isCancelled: true,
        cancelledAt: now,
        cancelRefundAmount: refundAmt,
      },
    });

    const fresh = await tx.bookingItem.findMany({ where: { bookingId } });
    const active = fresh.filter((row) => !row.isCancelled);
    const retainedAdvance = fresh
      .filter((row) => row.isCancelled && !(row.cancelRefundAmount > 0))
      .reduce((s, row) => s + (row.advance || 0), 0);
    const activePrice = active.reduce((s, row) => s + (row.price || 0), 0);
    const activeAdvance = active.reduce((s, row) => s + (row.advance || 0), 0);
    const totalAdvance = activeAdvance + retainedAdvance;
    const totalRemaining = Math.max(0, activePrice - activeAdvance);

    const prevRefund = booking.refundAmount || 0;
    const nextRefund = prevRefund + refundAmt;

    await tx.booking.update({
      where: { id: bookingId },
      data: {
        totalPrice: activePrice,
        price: activePrice,
        totalAdvance,
        advance: totalAdvance,
        totalRemaining,
        remaining: totalRemaining,
        ...(refundAmt > 0
          ? {
              refundAmount: nextRefund,
              refundedAt: booking.refundedAt || now,
            }
          : {}),
        // If every dress is cancelled, close the booking.
        ...(active.length === 0
          ? {
              status: "cancelled",
              refundAmount: nextRefund,
              refundedAt: nextRefund > 0 ? booking.refundedAt || now : null,
            }
          : {}),
      },
    });

    if (bi.itemId != null) {
      const stillUsed = await findItemIdsStillInActiveBookings([bi.itemId], bookingId, tx);
      if (!stillUsed.has(bi.itemId)) {
        await tx.clothingItem.update({
          where: { id: bi.itemId },
          data: { status: "available" },
        });
      }
    }
  });

  if (activeItemsRemain(booking.bookingItems, bookingItemId)) {
    await syncBookingStatusFromItems(bookingId);
  }

  const updated = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { bookingItems: true },
  });

  broadcastShopEvent({
    type: "booking.updated",
    bookingId,
    status: updated?.status || booking.status,
    by,
  });
  logActivity({
    username: by || "system",
    action: "cancelled",
    entity: "booking_item",
    entityId: bookingItemId,
    label: `Cancelled dress "${bi.dressName}" on booking #${String(booking.monthlySerial).padStart(2, "0")} — ${
      opts.refundAdvance ? `Advance refunded ₹${refundAmt}` : "Advance not refunded"
    }`,
    before: { bookingItemId, dressName: bi.dressName, advance: bi.advance },
    after: {
      isCancelled: true,
      cancelRefundAmount: refundAmt,
      bookingStatus: updated?.status,
      totalAdvance: updated?.totalAdvance,
    },
  });

  return updated;
}

function activeItemsRemain(
  items: Array<{ id: number; isCancelled?: boolean }>,
  justCancelledId: number,
) {
  return items.some((row) => row.id !== justCancelledId && !row.isCancelled);
}

export async function getRecycleBin() {
  return prisma.booking.findMany({
    where: { status: "cancelled" },
    include: { bookingItems: { include: { item: true } }, legacyItem: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function restoreBooking(
  bookingId: number,
  by?: string,
  opts?: { acknowledgeWarnings?: boolean },
) {
  const check = await getBookingRestoreCheck(bookingId);

  if (!check.canRestore) {
    const names = check.hardConflicts
      .map((r) => {
        const c = r.conflict!;
        return `${r.item_name} (Serial #${String(c.serial_no).padStart(2, "0")} — ${c.customer})`;
      })
      .join("; ");
    throw new RestoreAvailabilityError(
      `Cannot restore — dress already booked during these dates: ${names}`,
      check,
      "hard_conflict",
    );
  }

  if (check.hasWarnings && !opts?.acknowledgeWarnings) {
    throw new RestoreAvailabilityError(
      "Review scheduling warnings before restoring this booking.",
      check,
      "warnings_required",
    );
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { bookingItems: true },
  });
  if (!booking || booking.status !== "cancelled") throw new Error("Cannot restore");
  const beforeSnapshot = snapshotBooking(booking as unknown as Record<string, unknown>);
  await prisma.$transaction(async (tx) => {
    await tx.booking.update({ where: { id: bookingId }, data: { status: "booked" } });
    for (const bi of booking.bookingItems) {
      if (bi.itemId != null) {
        await tx.clothingItem.update({ where: { id: bi.itemId }, data: { status: "rented" } });
      }
    }
  });
  const updated = await prisma.booking.findUnique({ where: { id: bookingId }, include: { bookingItems: true } });
  logActivity({
    username: by || "system",
    action: "restored",
    entity: "booking",
    entityId: bookingId,
    label: `Restored from recycle bin — Booking #${String(booking.monthlySerial).padStart(2, "0")} — ${booking.customerName}`,
    before: beforeSnapshot,
    after: updated ? snapshotBooking(updated as unknown as Record<string, unknown>) : { status: "booked" },
  });
}

export async function deleteBookingPermanent(bookingId: number, by?: string) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: { bookingItems: true } });
  if (!booking || booking.status !== "cancelled") throw new Error("Only cancelled bookings can be deleted");
  const beforeSnapshot = snapshotBooking(booking as unknown as Record<string, unknown>);
  await prisma.booking.delete({ where: { id: bookingId } });
  logActivity({
    username: by || "system",
    action: "deleted",
    entity: "booking",
    entityId: bookingId,
    label: `Permanently deleted — Booking #${String(booking.monthlySerial).padStart(2, "0")} — ${booking.customerName}`,
    before: beforeSnapshot,
  });
}

export async function getDeliveryDetail(bookingId: number) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      bookingItems: {
        include: { item: { select: { photo: true, size: true, color: true, category: true } } },
      },
      orders: { where: { status: "active" }, orderBy: { deliveryDate: "asc" } },
      selectedJewellery: { where: { status: "active" }, orderBy: { id: "asc" } },
    },
  });
  if (!booking) return null;

  const itemIds = booking.bookingItems.map((bi) => bi.itemId).filter((id): id is number => id != null);
  const nextCandidates =
    itemIds.length > 0
      ? await prisma.booking.findMany({
          where: {
            id: { not: booking.id },
            deliveryDate: booking.returnDate,
            ...activeBookingWhere(),
            bookingItems: { some: { itemId: { in: itemIds } } },
          },
          include: { bookingItems: { where: { itemId: { in: itemIds } } } },
        })
      : [];

  const nextByItemId = new Map<number, (typeof nextCandidates)[number]>();
  for (const nxt of nextCandidates) {
    for (const bi of nxt.bookingItems) {
      if (bi.itemId == null) continue;
      if (!nextByItemId.has(bi.itemId)) nextByItemId.set(bi.itemId, nxt);
    }
  }

  const next_bookings = [];
  for (const bi of booking.bookingItems) {
    if (bi.itemId == null) continue;
    const nxt = nextByItemId.get(bi.itemId);
    if (nxt) {
      next_bookings.push({
        dress: dressDisplayName(bi.dressName, bi.category, bookingItemSize(bi)),
        next_customer: nxt.customerName,
        next_serial: nxt.monthlySerial,
        next_time: nxt.deliveryTime,
        next_venue: nxt.venue || "",
      });
    }
  }
  return { booking, next_bookings };
}

export { getAvailableItemsApi };
