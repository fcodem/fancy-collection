import prisma, { parseDateQ } from "../prisma";
import { unstable_cache } from "next/cache";
import { activeBookingWhere } from "@/lib/bookingActiveStatus";
import { whereBookingOverlapsPeriod, whereDeliveryInRange, whereReturnInRange, whereReturnOnAnyDates } from "../bookingDateQuery";
import { formatDate, parseDate } from "../constants";
import { Prisma } from "@prisma/client";
import { dressDisplayName, bookingItemSize, serializeBookingItems } from "../dress";
import { serializeStandardBookingDetails, bookingWarningRecordFrom } from "../bookingDetails";
import { isStarBooking } from "../starBooking";
import { getAvailableItemsApi, bookingUsesItem, findItemIdsStillInActiveBookings } from "../booking";
import { broadcastShopEvent } from "../realtime/broadcast";
import { logActivity, snapshotBooking } from "../activityLog";
import { deleteUploads, saveUpload } from "../upload";
import { syncBookingStatusFromItems } from "../syncBookingStatusFromItems";

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

async function clearBookingIdPhotos(booking: { idPhoto1?: string | null; idPhoto2?: string | null }) {
  await deleteUploads([booking.idPhoto1, booking.idPhoto2]);
}

/** When every delivered dress is returned (none incomplete), close the booking. */
async function finalizeFullReturnIfComplete(
  bookingId: number,
  tx: Prisma.TransactionClient,
) {
  const booking = await tx.booking.findUnique({
    where: { id: bookingId },
    include: { bookingItems: true },
  });
  if (!booking || booking.status === "returned" || booking.status === "cancelled" || booking.status === "incomplete_return") {
    return;
  }

  const delivered = booking.bookingItems.filter((bi) => bi.isDelivered);
  if (!delivered.length) return;

  const allReturned = delivered.every((bi) => bi.isReturned);
  const anyIncomplete = delivered.some((bi) => bi.isIncompleteReturn);
  if (!allReturned || anyIncomplete) return;

  await clearBookingIdPhotos(booking);
  await tx.booking.update({
    where: { id: bookingId },
    data: {
      status: "returned",
      returnedAt: booking.returnedAt || new Date(),
      securityHeld: 0,
      idPhoto1: null,
      idPhoto2: null,
    },
  });
}

/** After an incomplete dress is returned, recalculate held security or close the booking. */
async function syncIncompleteReturnStatus(
  bookingId: number,
  tx: Prisma.TransactionClient,
) {
  const booking = await tx.booking.findUnique({
    where: { id: bookingId },
    include: { bookingItems: true },
  });
  if (!booking || booking.status !== "incomplete_return") return;

  const delivered = booking.bookingItems.filter((bi) => bi.isDelivered);
  const incomplete = delivered.filter((bi) => bi.isIncompleteReturn);
  const totalSecurityHeld = incomplete.reduce((s, bi) => s + (bi.itemSecurityHeld || 0), 0);

  if (incomplete.length === 0) {
    const allReturned = delivered.length > 0 && delivered.every((bi) => bi.isReturned);
    if (allReturned) {
      await clearBookingIdPhotos(booking);
      await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: "returned",
          securityHeld: 0,
          idPhoto1: null,
          idPhoto2: null,
        },
      });
    } else {
      await tx.booking.update({
        where: { id: bookingId },
        data: { securityHeld: 0 },
      });
    }
    return;
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

export async function getDashboardFreeItems(deliveryDateStr: string, returnDateStr: string, categoryFilter = "") {
  if (!deliveryDateStr || !returnDateStr) {
    return { free_items: [], returning_on_delivery: [], warnings: {} };
  }

  const dDate = parseDateQ(deliveryDateStr);
  const rDate = parseDateQ(returnDateStr);

  const allItems = await prisma.clothingItem.findMany({
    where: {
      status: { not: "maintenance" },
      ...(categoryFilter ? { category: categoryFilter } : {}),
    },
  });

  const [overlapWhere, returningOnDeliveryWhere, deliveryOnReturnWhere] = await Promise.all([
    whereBookingOverlapsPeriod(deliveryDateStr, returnDateStr),
    whereReturnInRange(deliveryDateStr, deliveryDateStr),
    whereDeliveryInRange(returnDateStr, returnDateStr),
  ]);

  const overlappingBookings = await prisma.booking.findMany({
    where: {
      status: { in: ["booked", "delivered"] },
      ...overlapWhere,
    },
    select: {
      itemId: true,
      bookingItems: { select: { itemId: true } },
    },
  });

  const bookedItemIds = new Set<number>();
  for (const b of overlappingBookings) {
    if (b.bookingItems.length) b.bookingItems.forEach((bi) => bookedItemIds.add(bi.itemId));
    else if (b.itemId) bookedItemIds.add(b.itemId);
  }

  const overlappingRentals = await prisma.rental.findMany({
    where: {
      status: { in: ["active", "overdue"] },
      startDate: { lte: rDate },
      endDate: { gte: dDate },
    },
    include: { items: true },
  });
  const rentedItemIds = new Set<number>();
  for (const r of overlappingRentals) r.items.forEach((ri) => rentedItemIds.add(ri.itemId));

  const busyIds = new Set([...bookedItemIds, ...rentedItemIds]);

  const returningOnDeliveryBookings = await prisma.booking.findMany({
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
  });
  const returningOnDeliveryIds = new Set<number>();
  for (const b of returningOnDeliveryBookings) {
    if (b.bookingItems.length) b.bookingItems.forEach((bi) => returningOnDeliveryIds.add(bi.itemId));
    else if (b.itemId) returningOnDeliveryIds.add(b.itemId);
  }

  const bookingsOnReturnDate = await prisma.booking.findMany({
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
  });
  const bookedOnReturnIds = new Set<number>();
  const bookedOnReturnInfo: Record<string, object> = {};
  for (const b of bookingsOnReturnDate) {
    const ids = b.bookingItems.length ? b.bookingItems.map((bi) => bi.itemId) : b.itemId ? [b.itemId] : [];
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
        color: i.color || "",
        size: i.size || "",
      });
      if (bookedOnReturnInfo[String(i.id)]) warnings[String(i.id)] = bookedOnReturnInfo[String(i.id)];
    }
  }

  const returning_on_delivery = [];
  const returnItemIds = new Set<number>();
  for (const b of returningOnDeliveryBookings) {
    if (b.bookingItems.length) b.bookingItems.forEach((bi) => returnItemIds.add(bi.itemId));
    else if (b.itemId) returnItemIds.add(b.itemId);
  }
  const returnItemsById = new Map(
    (await prisma.clothingItem.findMany({ where: { id: { in: [...returnItemIds] } } })).map((i) => [i.id, i])
  );

  for (const b of returningOnDeliveryBookings) {
    const itemsInB = b.bookingItems.length
      ? b.bookingItems.map((bi) => ({ id: bi.itemId, name: bi.dressName, cat: bi.category || "" }))
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
  const dIso = deliveryDateStr.slice(0, 10);
  const rIso = returnDateStr.slice(0, 10);

  const excludeId = bookingId > 0 ? bookingId : undefined;
  const uniqueIds = [...new Set(itemIds)];

  const [returnOnDeliveryWhere, deliveryOnReturnWhere, overlapWhere] = await Promise.all([
    whereReturnInRange(dIso, dIso),
    whereDeliveryInRange(rIso, rIso),
    whereBookingOverlapsPeriod(dIso, rIso),
  ]);

  const [items, overlapBookings, retWarnBookings, delWarnBookings] = await Promise.all([
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
  bookingItems: Array<{ itemId: number }>;
}) {
  const ids = booking.bookingItems.map((bi) => bi.itemId);
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
    include: { bookingItems: { include: { item: true } }, legacyItem: true },
    orderBy: [{ deliveryDate: "asc" }, { deliveryTime: "asc" }],
  });

  const deliveryDateStrs = [...new Set(bookings.map((b) => formatDate(b.deliveryDate, "iso")))];
  type ReturningBooking = Awaited<
    ReturnType<
      typeof prisma.booking.findMany<{
        include: { bookingItems: true };
      }>
    >
  >[number];
  const returningByDeliveryDate = new Map<number, ReturningBooking[]>();
  if (deliveryDateStrs.length) {
    const returningBookings = await prisma.booking.findMany({
      where: {
        ...(await whereReturnOnAnyDates(deliveryDateStrs)),
        status: { in: ["booked", "delivered"] },
      },
      include: { bookingItems: { include: { item: true } }, legacyItem: true },
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
            retWarning = packingWarningFromBooking(rb);
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
          photo: itemObj?.photo || "",
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
    if (!items_data.length) continue;
    results.push({
      ...packingRecordFromBooking(b),
      items: items_data,
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
  const bi = await prisma.bookingItem.findUnique({ where: { id: data.bi_id } });
  if (!bi) throw new Error("Item not found");
  const beforePacking = { preparedBy: bi.preparedBy, checkedBy: bi.checkedBy, isPackedReady: bi.isPackedReady, packingNote: bi.packingNote };
  const updated = await prisma.bookingItem.update({
    where: { id: data.bi_id },
    data: {
      ...(data.prepared_by !== undefined ? { preparedBy: data.prepared_by.trim() || null } : {}),
      ...(data.checked_by !== undefined ? { checkedBy: data.checked_by.trim() || null } : {}),
      ...(data.is_packed_ready !== undefined ? { isPackedReady: Boolean(data.is_packed_ready) } : {}),
      ...(data.packing_note !== undefined ? { packingNote: data.packing_note.trim() || null } : {}),
    },
  });
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

export async function saveDelivery(
  bookingId: number,
  data: {
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
  },
  by?: string,
) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { bookingItems: true },
  });
  if (!booking) throw new Error("Booking not found");
  const beforeDelivery = snapshotBooking(booking as unknown as Record<string, unknown>);
  const resolveRemainingPaymentMode = (totalRemainingCollected: number) =>
    totalRemainingCollected > 0
      ? data.payment_mode === "online"
        ? "online"
        : "cash"
      : booking.remainingPaymentMode;

  const resolveSecurityPaymentMode = (totalSecurityCollected: number) =>
    totalSecurityCollected > 0
      ? data.security_payment_mode === "online"
        ? "online"
        : "cash"
      : booking.securityPaymentMode;

  if (data.items?.length) {
    const result = await prisma.$transaction(async (tx) => {
      const itemById = new Map(booking.bookingItems.map((bi) => [bi.id, bi]));
      const updates = data.items!.map((item) => {
        const bi = itemById.get(item.booking_item_id);
        if (!bi) return null;

        const itemUpdate: {
          itemRemainingCollected: number;
          itemSecurityCollected: number;
          itemDeliveryNotes: string | null;
          isDelivered?: boolean;
          deliveredAt?: Date;
        } = {
          itemRemainingCollected: item.remaining_collected,
          itemSecurityCollected: item.security_collected,
          itemDeliveryNotes: item.delivery_notes?.trim() || null,
        };

        if (item.mark_delivered && !bi.isDelivered) {
          itemUpdate.isDelivered = true;
          itemUpdate.deliveredAt = new Date();
        }

        return tx.bookingItem.update({ where: { id: bi.id }, data: itemUpdate });
      });

      await Promise.all(updates.filter(Boolean));

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
        refreshed.bookingItems.some((bi) => bi.isDelivered) || refreshed.status === "delivered";
      const nextSecurityHeld =
        booking.status === "incomplete_return"
          ? booking.securityHeld
          : totalSecurity > 0
            ? totalSecurity
            : dressIsOut && booking.securityDeposit > 0
              ? booking.securityDeposit
              : 0;

      let updated = await tx.booking.update({
        where: { id: bookingId },
        data: {
          remainingCollected: totalRemaining,
          securityCollected: totalSecurity,
          securityHeld: nextSecurityHeld,
          deliveryNotes: newNotes || data.delivery_notes || booking.deliveryNotes,
          remainingPaymentMode: resolveRemainingPaymentMode(totalRemaining),
          securityPaymentMode: resolveSecurityPaymentMode(totalSecurity),
        },
        include: { bookingItems: true },
      });

      if (
        updated.status === "booked" &&
        updated.bookingItems.length > 0 &&
        updated.bookingItems.every((bi) => bi.isDelivered)
      ) {
        const itemDeliveredAt = updated.bookingItems.map((bi) => bi.deliveredAt).find((d): d is Date => d != null);
        updated = await tx.booking.update({
          where: { id: bookingId },
          data: {
            status: "delivered",
            deliveredAt: updated.deliveredAt || itemDeliveredAt || new Date(),
          },
          include: { bookingItems: true },
        });
      }

      return updated;
    });

    broadcastShopEvent({ type: "booking.delivered", bookingId, status: result.status, by });
    const deliveryDresses =
      booking.bookingItems.map((bi) => bi.dressName).filter(Boolean).join(", ") || booking.dressName || "";
    void logActivity({
      username: by || "system",
      action: "delivered",
      entity: "booking",
      entityId: bookingId,
      label: `Delivery — Booking #${String(booking.monthlySerial).padStart(2, "0")} — ${booking.customerName}${deliveryDresses ? ` (${deliveryDresses})` : ""}`,
      before: beforeDelivery,
      after: snapshotBooking(result as unknown as Record<string, unknown>),
    });
    return result;
  }

  if (data.mark_delivered && booking.status === "booked" && booking.bookingItems.length > 0) {
    await prisma.bookingItem.updateMany({
      where: { bookingId },
      data: { isDelivered: true, deliveredAt: new Date() },
    });
  }

  const secCollected = data.security_collected ?? booking.securityCollected;
  const dressIsOut = data.mark_delivered || booking.status === "delivered";
  const nextSecurityHeld =
    booking.status === "incomplete_return"
      ? booking.securityHeld
      : secCollected > 0
        ? secCollected
        : dressIsOut && booking.securityDeposit > 0
          ? booking.securityDeposit
          : 0;

  const totalRemainingCollected = data.remaining_collected ?? booking.remainingCollected;

  const bookingFields = {
    remainingCollected: totalRemainingCollected,
    securityCollected: secCollected,
    securityHeld: nextSecurityHeld,
    deliveryNotes: data.delivery_notes ?? booking.deliveryNotes,
    remainingPaymentMode: resolveRemainingPaymentMode(totalRemainingCollected),
    securityPaymentMode: resolveSecurityPaymentMode(secCollected),
  };

  if (data.mark_delivered && booking.status === "booked" && booking.bookingItems.length === 0) {
    await prisma.booking.update({
      where: { id: bookingId },
      data: {
        ...bookingFields,
        status: "delivered",
        deliveredAt: booking.deliveredAt || new Date(),
      },
    });
  } else {
    await prisma.booking.update({
      where: { id: bookingId },
      data: bookingFields,
    });
  }

  const result = (await syncBookingStatusFromItems(bookingId))!;
  broadcastShopEvent({ type: "booking.delivered", bookingId, status: result.status, by });
  const deliveryDresses2 =
    booking.bookingItems.map((bi) => bi.dressName).filter(Boolean).join(", ") || booking.dressName || "";
  void logActivity({
    username: by || "system",
    action: "delivered",
    entity: "booking",
    entityId: bookingId,
    label: `Delivery — Booking #${String(booking.monthlySerial).padStart(2, "0")} — ${booking.customerName}${deliveryDresses2 ? ` (${deliveryDresses2})` : ""}`,
    before: beforeDelivery,
    after: snapshotBooking(result as unknown as Record<string, unknown>),
  });
  return result;
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

  if (data.id_photo_1 instanceof File && data.id_photo_1.size > 0) {
    if (idPhoto1) await deleteUploads([idPhoto1]);
    idPhoto1 = await saveUpload(data.id_photo_1);
  }
  if (data.id_photo_2 instanceof File && data.id_photo_2.size > 0) {
    if (idPhoto2) await deleteUploads([idPhoto2]);
    idPhoto2 = await saveUpload(data.id_photo_2);
  }

  const result = await prisma.booking.update({
    where: { id: bookingId },
    data: { idPhoto1, idPhoto2 },
  });

  logActivity({
    username: by || "system",
    action: "updated",
    entity: "booking",
    entityId: bookingId,
    label: `ID photos — Booking #${String(booking.monthlySerial).padStart(2, "0")} — ${booking.customerName}`,
    before: { idPhoto1: booking.idPhoto1, idPhoto2: booking.idPhoto2 },
    after: { idPhoto1: result.idPhoto1, idPhoto2: result.idPhoto2 },
  });

  return result;
}

export async function saveReturn(
  bookingId: number,
  action: string,
  data: {
    booking_item_id?: number;
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
  },
  by?: string,
) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { bookingItems: true },
  });
  if (!booking) throw new Error("Booking not found");

  if (action === "mark_returned") {
    if (booking.status === "incomplete_return") {
      return resolveIncompleteReturn(bookingId, by);
    }
    await clearBookingIdPhotos(booking);
    await prisma.$transaction(async (tx) => {
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
      for (const bi of booking.bookingItems) {
        if (bi.isDelivered) {
          await tx.bookingItem.update({ where: { id: bi.id }, data: { isReturned: true } });
        }
        await tx.clothingItem.update({ where: { id: bi.itemId }, data: { status: "available" } });
      }
    });
  } else if (action === "mark_item_returned") {
    if (!booking.bookingItems.length) {
      await clearBookingIdPhotos(booking);
      await prisma.$transaction(async (tx) => {
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
        if (booking.itemId) {
          await tx.clothingItem.update({ where: { id: booking.itemId }, data: { status: "available" } });
        }
      });
    } else {
      const itemId = data.booking_item_id;
      if (!itemId) throw new Error("Dress not specified.");
      const bi = booking.bookingItems.find((row) => row.id === itemId);
      if (!bi) throw new Error("Dress not found on this booking.");
      if (!bi.isDelivered) throw new Error("Dress must be delivered before it can be returned.");
      if (bi.isReturned) throw new Error("This dress is already marked returned.");

      await prisma.$transaction(async (tx) => {
        if (bi.isIncompleteReturn) {
          await tx.bookingItem.update({
            where: { id: bi.id },
            data: {
              isReturned: true,
              isIncompleteReturn: false,
              itemIncompleteNotes: null,
              itemIncompletePhoto: null,
              itemSecurityHeld: 0,
            },
          });
          await tx.clothingItem.update({
            where: { id: bi.itemId },
            data: { status: "available" },
          });
          await syncIncompleteReturnStatus(bookingId, tx);
          return;
        }

        await tx.bookingItem.update({
          where: { id: bi.id },
          data: { isReturned: true, isIncompleteReturn: false },
        });
        await tx.clothingItem.update({
          where: { id: bi.itemId },
          data: { status: "available" },
        });
        await finalizeFullReturnIfComplete(bookingId, tx);
      });
    }
  } else if (action === "resolve_incomplete_return") {
    const resolved = await resolveIncompleteReturn(bookingId, by);
    if (!resolved) throw new Error("Booking is not an incomplete return or could not be resolved.");
    return resolved;
  } else if (action === "incomplete_return") {
    await clearBookingIdPhotos(booking);

    if (!booking.bookingItems.length) {
      await prisma.booking.update({
        where: { id: bookingId },
        data: {
          status: "incomplete_return",
          incompleteNotes: data.incomplete_notes || "",
          incompletePhoto: data.incomplete_photo || null,
          securityHeld: data.security_held || 0,
          returnedAt: new Date(),
          idPhoto1: null,
          idPhoto2: null,
        },
      });
      if (booking.itemId) {
        await prisma.clothingItem.update({
          where: { id: booking.itemId },
          data: { status: "rented" },
        });
      }
    } else {
      const itemPayload = data.items || [];
      const incompleteIds = new Set(
        itemPayload.filter((i) => i.is_incomplete).map((i) => i.booking_item_id),
      );

      if (itemPayload.length > 0 && incompleteIds.size === 0) {
        throw new Error("Select at least one dress for incomplete return.");
      }

      await prisma.$transaction(async (tx) => {
        let totalSecurityHeld = 0;
        const noteParts: string[] = [];
        let firstPhoto = data.incomplete_photo || null;

        for (const bi of booking.bookingItems) {
          if (!bi.isDelivered) continue;

          const row = itemPayload.find((i) => i.booking_item_id === bi.id);
          const isIncomplete = itemPayload.length === 0 ? true : Boolean(row?.is_incomplete);

          if (isIncomplete) {
            const held = row?.security_held ?? 0;
            totalSecurityHeld += held;
            const notes = row?.incomplete_notes?.trim() || "";
            if (notes) noteParts.push(`${bi.dressName}: ${notes}`);
            if (row?.incomplete_photo && !firstPhoto) firstPhoto = row.incomplete_photo;

            await tx.bookingItem.update({
              where: { id: bi.id },
              data: {
                isIncompleteReturn: true,
                isReturned: false,
                itemIncompleteNotes: notes || null,
                itemIncompletePhoto: row?.incomplete_photo || null,
                itemSecurityHeld: held,
              },
            });
          } else {
            await tx.bookingItem.update({
              where: { id: bi.id },
              data: {
                isReturned: true,
                isIncompleteReturn: false,
                itemIncompleteNotes: null,
                itemIncompletePhoto: null,
                itemSecurityHeld: 0,
              },
            });
            await tx.clothingItem.update({
              where: { id: bi.itemId },
              data: { status: "available" },
            });
          }
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
            idPhoto1: null,
            idPhoto2: null,
          },
        });
      });
    }
  }
  const updated = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (updated) {
    broadcastShopEvent({ type: "booking.returned", bookingId, status: updated.status, by });
    const returnDresses =
      booking.bookingItems.map((bi) => bi.dressName).filter(Boolean).join(", ") || booking.dressName || "";
    logActivity({
      username: by || "system",
      action: "returned",
      entity: "booking",
      entityId: bookingId,
      label: `Return (${action}) — Booking #${String(booking.monthlySerial).padStart(2, "0")} — ${booking.customerName}${returnDresses ? ` (${returnDresses})` : ""}`,
      before: snapshotBooking(booking as unknown as Record<string, unknown>),
      after: snapshotBooking(updated as unknown as Record<string, unknown>),
    });
  }
  return updated;
}

export async function resolveIncompleteReturn(bookingId: number, by?: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { bookingItems: true },
  });
  if (!booking || booking.status !== "incomplete_return") return null;

  const beforeSnapshot = snapshotBooking(booking as unknown as Record<string, unknown>);

  await prisma.$transaction(async (tx) => {
    await tx.booking.update({
      where: { id: bookingId },
      data: { status: "returned", securityHeld: 0 },
    });
    for (const bi of booking.bookingItems) {
      await tx.bookingItem.update({
        where: { id: bi.id },
        data: {
          isReturned: true,
          isIncompleteReturn: false,
          itemIncompleteNotes: null,
          itemIncompletePhoto: null,
          itemSecurityHeld: 0,
        },
      });
      await tx.clothingItem.update({
        where: { id: bi.itemId },
        data: { status: "available" },
      });
    }
    if (booking.itemId && !booking.bookingItems.length) {
      await tx.clothingItem.update({
        where: { id: booking.itemId },
        data: { status: "available" },
      });
    }
  });

  const updated = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (updated) {
    logActivity({
      username: by || "system",
      action: "returned",
      entity: "booking",
      entityId: bookingId,
      label: `Resolved incomplete return — Booking #${String(booking.monthlySerial).padStart(2, "0")} — ${booking.customerName}`,
      before: beforeSnapshot,
      after: snapshotBooking(updated as unknown as Record<string, unknown>),
    });
  }
  return updated;
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
  for (const b of returning) {
    const itemRows = serializeBookingItems(b);
    const itemIds = b.bookingItems.length
      ? b.bookingItems.map((bi) => bi.itemId)
      : b.itemId
        ? [b.itemId]
        : [];
    const retIdSet = new Set(itemIds);

    let next_booking: ReturnType<typeof alternateBookingSide> | null = null;

    for (const nxt of candidates) {
      if (nxt.id === b.id) continue;
      const nxtIds = nxt.bookingItems.length
        ? nxt.bookingItems.map((bi) => bi.itemId)
        : nxt.itemId
          ? [nxt.itemId]
          : [];
      const matchedIds = nxtIds.filter((id) => retIdSet.has(id));
      if (!matchedIds.length) continue;

      const matchedNames = nxt.bookingItems.length
        ? nxt.bookingItems
            .filter((bi) => matchedIds.includes(bi.itemId))
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
    const itemIds = booking.bookingItems.map((bi) => bi.itemId);
    const stillUsed = await findItemIdsStillInActiveBookings(itemIds, bookingId, tx);
    for (const bi of booking.bookingItems) {
      if (!stillUsed.has(bi.itemId)) {
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
        return `${r.item_name} (Serial #${String(c.serial_no).padStart(2, "0")} — ${c.customer || c.customer_name})`;
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
      await tx.clothingItem.update({ where: { id: bi.itemId }, data: { status: "rented" } });
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
    },
  });
  if (!booking) return null;

  const itemIds = booking.bookingItems.map((bi) => bi.itemId);
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
      if (!nextByItemId.has(bi.itemId)) nextByItemId.set(bi.itemId, nxt);
    }
  }

  const next_bookings = [];
  for (const bi of booking.bookingItems) {
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
