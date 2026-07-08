import prisma from "@/lib/prisma";
import { findItemIdsStillInActiveBookings } from "@/lib/booking";
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
  const result = await monthBasedSearchBookings(
    queryText,
    date,
    "",
    page != null ? String(page) : null,
    pageSize != null ? String(pageSize) : null,
  );
  return {
    ...result,
    results: result.results.filter((r) => r.status === "booked"),
  };
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
    list = list.filter((r) => {
      const hay = [
        String(r.serial),
        r.customer_name,
        r.contact_1,
        r.whatsapp_no,
        r.dress_names,
        r.venue,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
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
    include: { bookingItems: { include: { item: true } }, legacyItem: true },
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
