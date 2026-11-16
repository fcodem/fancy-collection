import prisma from "@/lib/prisma";
import { findItemIdsStillInActiveBookings } from "@/lib/booking";
import { bookingItemRemaining, sumBookingFittingCharges } from "@/lib/bookingLineTotals";
import { bookingListRecordFrom, type BookingForListRecord } from "@/lib/bookingDetails";
import { dressDisplayName, bookingItemSize } from "@/lib/dress";
import { formatDate } from "@/lib/constants";
import { logActivity, snapshotBooking } from "@/lib/activityLog";
import { broadcastShopEvent } from "@/lib/realtime/broadcast";
import { monthBasedSearchBookings } from "@/lib/services/bookingSearchCore";
import { cachedQuery } from "@/lib/perfCache";

const postponedListSelect = {
  id: true,
  monthlySerial: true,
  status: true,
  totalAdvance: true,
  advance: true,
  postponedAt: true,
  customerName: true,
  contact1: true,
  whatsappNo: true,
  dressName: true,
  venue: true,
  deliveryDate: true,
  returnDate: true,
  deliveryTime: true,
  returnTime: true,
  bookingItems: {
    select: {
      dressName: true,
      category: true,
      size: true,
      item: { select: { size: true } },
    },
  },
  legacyItem: { select: { size: true, category: true } },
} as const;

export type PostponedBookingRow = ReturnType<typeof bookingListRecordFrom> & {
  id: number;
  serial: number;
  status: string;
  total_advance: number;
  postponed_at: string | null;
};

function serializePostponedRow(
  b: BookingForListRecord & {
    id: number;
    status: string;
    totalAdvance: number;
    advance: number;
    postponedAt?: Date | null;
  },
): PostponedBookingRow {
  const record = bookingListRecordFrom(b);
  return {
    ...record,
    id: b.id,
    serial: b.monthlySerial,
    status: b.status,
    total_advance: b.totalAdvance || b.advance || 0,
    postponed_at: b.postponedAt ? formatDate(b.postponedAt, "display") : null,
  };
}

/** Search active booked records that can be marked postponed. */
export async function searchBookingsToPostpone(
  queryText: string,
  date: string,
  page?: string | number | null,
  pageSize?: string | number | null,
) {
  return monthBasedSearchBookings(
    queryText,
    date,
    "",
    page != null ? String(page) : null,
    pageSize != null ? String(pageSize) : null,
  );
}

export async function listPostponedBookings(searchQ?: string) {
  const q = (searchQ || "").trim().toLowerCase();
  const rows = await prisma.booking.findMany({
    where: { status: "postponed" },
    select: postponedListSelect,
    orderBy: [{ createdAt: "desc" }, { monthlySerial: "desc" }],
  });

  let list = rows.map((b) => serializePostponedRow(b as BookingForListRecord & typeof b));
  if (q) {
    const qNorm = q.replace(/^#/, "");
    list = list.filter((r) => {
      const serialPlain = String(r.serial);
      const serialPadded = serialPlain.padStart(2, "0");
      const hay = [
        serialPlain,
        serialPadded,
        `#${serialPadded}`,
        r.customer_name,
        r.contact_1,
        r.whatsapp_no,
        r.dress_names,
        r.venue,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q) || hay.includes(qNorm);
    });
  }

  const total_advance_held = list.reduce((s, r) => s + (r.total_advance || 0), 0);
  return { results: list, total_advance_held, count: list.length };
}

export function listPostponedBookingsCached(searchQ?: string) {
  const q = (searchQ || "").trim();
  if (q) return listPostponedBookings(q);
  return cachedQuery(["postponed-booking-list"], () => listPostponedBookings(""), 30);
}

export async function postponeBooking(bookingId: number, by?: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { bookingItems: true },
  });
  if (!booking) throw new Error("Booking not found");
  if (booking.status !== "booked") {
    throw new Error("Only booked (not yet delivered) bookings can be postponed");
  }

  await prisma.$transaction(async (tx) => {
    await tx.booking.update({
      where: { id: bookingId },
      data: { status: "postponed" },
    });
    await tx.$executeRaw`UPDATE bookings SET postponed_at = NOW() WHERE id = ${bookingId}`;
    const itemIds = booking.bookingItems.map((bi) => bi.itemId).filter((id): id is number => id != null);
    const stillUsed = await findItemIdsStillInActiveBookings(itemIds, bookingId, tx);
    for (const bi of booking.bookingItems) {
      if (bi.itemId != null && !stillUsed.has(bi.itemId)) {
        await tx.clothingItem.update({ where: { id: bi.itemId }, data: { status: "available" } });
      }
    }
  });

  broadcastShopEvent({ type: "booking.postponed", bookingId, status: "postponed", by });
  logActivity({
    username: by || "system",
    action: "postponed",
    entity: "booking",
    entityId: bookingId,
    label: `Postponed — Booking #${String(booking.monthlySerial).padStart(2, "0")} — ${booking.customerName} (Advance held: ₹${booking.totalAdvance || booking.advance || 0})`,
    before: snapshotBooking(booking as unknown as Record<string, unknown>),
    after: { status: "postponed", totalAdvance: booking.totalAdvance || booking.advance },
  });
}

/**
 * Postpone only some dresses of a multi-dress booking. The chosen dresses (with their
 * own rent / advance) move to a new postponed record that keeps the same serial; the
 * original booking stays active with the remaining dresses.
 */
export async function postponeBookingItems(bookingId: number, bookingItemIds: number[], by?: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { bookingItems: true },
  });
  if (!booking) throw new Error("Booking not found");
  if (booking.status !== "booked") {
    throw new Error("Only booked (not yet delivered) bookings can be postponed");
  }

  const active = booking.bookingItems.filter((bi) => !bi.isCancelled);
  const wanted = new Set(bookingItemIds);
  const moving = active.filter((bi) => wanted.has(bi.id));
  if (!moving.length) throw new Error("Select at least one dress to postpone.");
  const blocked = moving.filter((bi) => bi.isDelivered || bi.isReturned);
  if (blocked.length) {
    throw new Error(`${blocked.map((bi) => bi.dressName).join(", ")} already delivered — cannot postpone.`);
  }
  if (moving.length === active.length) {
    await postponeBooking(bookingId, by);
    return { postponedBookingId: bookingId, whole: true };
  }

  const existingSuffixes = await prisma.booking.count({
    where: { bookingNumber: { startsWith: `${booking.bookingNumber}-P` } },
  });
  let suffix = existingSuffixes + 1;
  while (await prisma.booking.findUnique({ where: { bookingNumber: `${booking.bookingNumber}-P${suffix}` }, select: { id: true } })) {
    suffix += 1;
  }
  const newNumber = `${booking.bookingNumber}-P${suffix}`;

  const sum = (rows: typeof moving, pick: (r: (typeof moving)[number]) => number) =>
    rows.reduce((s, r) => s + (pick(r) || 0), 0);
  const movedPrice = sum(moving, (r) => r.price);
  const movedFitting = sumBookingFittingCharges(moving);
  const movedAdvance = sum(moving, (r) => r.advance);
  const movedRemaining = moving.reduce(
    (s, r) => s + bookingItemRemaining(r.price || 0, r.advance || 0, r.fittingCharges || 0),
    0,
  );

  const newId = await prisma.$transaction(async (tx) => {
    const created = await tx.booking.create({
      data: {
        bookingNumber: newNumber,
        monthlySerial: booking.monthlySerial,
        customerName: booking.customerName,
        customerAddress: booking.customerAddress,
        contact1: booking.contact1,
        contact2: booking.contact2,
        whatsappNo: booking.whatsappNo,
        deliveryDate: booking.deliveryDate,
        deliveryTime: booking.deliveryTime,
        returnDate: booking.returnDate,
        returnTime: booking.returnTime,
        venue: booking.venue,
        staffNames: booking.staffNames,
        advancePaymentMode: booking.advancePaymentMode,
        commonNotes: booking.commonNotes,
        notes: booking.notes,
        createdAt: booking.createdAt,
        securityDeposit: 0,
        totalPrice: movedPrice,
        price: movedPrice,
        totalFittingCharges: movedFitting,
        totalAdvance: movedAdvance,
        advance: movedAdvance,
        totalRemaining: movedRemaining,
        remaining: movedRemaining,
        itemId: moving[0].itemId,
        dressName: moving[0].dressName,
        status: "postponed",
        postponedAt: new Date(),
      },
      select: { id: true },
    });

    await tx.bookingItem.updateMany({
      where: { id: { in: moving.map((m) => m.id) }, bookingId },
      data: { bookingId: created.id },
    });

    const stay = await tx.bookingItem.findMany({ where: { bookingId } });
    const stayActive = stay.filter((r) => !r.isCancelled);
    const retainedAdvance = stay
      .filter((r) => r.isCancelled && !(r.cancelRefundAmount > 0))
      .reduce((s, r) => s + (r.advance || 0), 0);
    const stayPrice = stayActive.reduce((s, r) => s + (r.price || 0), 0);
    const stayAdvance = stayActive.reduce((s, r) => s + (r.advance || 0), 0) + retainedAdvance;
    const stayRemaining = stayActive.reduce(
      (s, r) => s + bookingItemRemaining(r.price || 0, r.advance || 0, r.fittingCharges || 0),
      0,
    );
    await tx.booking.update({
      where: { id: bookingId },
      data: {
        totalPrice: stayPrice,
        price: stayPrice,
        totalFittingCharges: sumBookingFittingCharges(stayActive),
        totalAdvance: stayAdvance,
        advance: stayAdvance,
        totalRemaining: stayRemaining,
        remaining: stayRemaining,
        itemId: stayActive[0]?.itemId ?? booking.itemId,
        dressName: stayActive[0]?.dressName ?? booking.dressName,
      },
    });

    const itemIds = moving.map((bi) => bi.itemId).filter((id): id is number => id != null);
    const stillUsed = await findItemIdsStillInActiveBookings(itemIds, created.id, tx);
    for (const id of itemIds) {
      if (!stillUsed.has(id)) {
        await tx.clothingItem.update({ where: { id }, data: { status: "available" } });
      }
    }
    return created.id;
  });

  broadcastShopEvent({ type: "booking.updated", bookingId, status: "booked", by });
  broadcastShopEvent({ type: "booking.postponed", bookingId: newId, status: "postponed", by });
  logActivity({
    username: by || "system",
    action: "postponed",
    entity: "booking",
    entityId: newId,
    label: `Postponed ${moving.length} dress${moving.length === 1 ? "" : "es"} (${moving
      .map((m) => m.dressName)
      .join(", ")}) from booking #${String(booking.monthlySerial).padStart(2, "0")} — ${booking.customerName} → ${newNumber} (Advance held: ₹${movedAdvance})`,
    before: snapshotBooking(booking as unknown as Record<string, unknown>),
    after: { status: "postponed", fromBookingId: bookingId, bookingNumber: newNumber, totalAdvance: movedAdvance },
  });

  return { postponedBookingId: newId, whole: false };
}

export async function resolvePostponedBooking(bookingId: number, by?: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { bookingItems: true },
  });
  if (!booking) throw new Error("Booking not found");
  if (booking.status !== "postponed") throw new Error("Only postponed bookings can be resolved");

  await prisma.booking.delete({ where: { id: bookingId } });

  broadcastShopEvent({ type: "booking.postponed_resolved", bookingId, by });
  logActivity({
    username: by || "system",
    action: "deleted",
    entity: "booking",
    entityId: bookingId,
    label: `Resolved (removed) postponed booking #${String(booking.monthlySerial).padStart(2, "0")} — ${booking.customerName}`,
    before: snapshotBooking(booking as unknown as Record<string, unknown>),
  });
}

export async function getPostponedPrintDetail(bookingId: number) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      bookingItems: { include: { item: { select: { id: true, name: true, size: true, sku: true } } } },
      legacyItem: { select: { id: true, name: true, sku: true, size: true, category: true, photo: true, status: true } },
    },
  });
  if (!booking || booking.status !== "postponed") return null;

  const lineItems = booking.bookingItems.length
    ? booking.bookingItems.map((bi) => ({
        name: dressDisplayName(bi.dressName, bi.category, bookingItemSize(bi)),
        advance: bi.advance,
      }))
    : booking.dressName
      ? [{
          name: dressDisplayName(booking.dressName, booking.legacyItem?.category, booking.legacyItem?.size),
          advance: booking.advance || booking.totalAdvance,
        }]
      : [];

  const postponedAtRaw = booking.postponedAt;

  return {
    booking,
    lineItems,
    totalAdvance: booking.totalAdvance || booking.advance || 0,
    postponedAt: postponedAtRaw
      ? formatDate(postponedAtRaw, "display")
      : formatDate(new Date(), "display"),
  };
}
