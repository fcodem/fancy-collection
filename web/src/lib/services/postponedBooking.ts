import prisma from "@/lib/prisma";
import { findItemIdsStillInActiveBookings } from "@/lib/booking";
import { serializeStandardBookingDetails } from "@/lib/bookingDetails";
import { dressDisplayName, bookingItemSize } from "@/lib/dress";
import { formatDate } from "@/lib/constants";
import { logActivity, snapshotBooking } from "@/lib/activityLog";
import { broadcastShopEvent } from "@/lib/realtime/broadcast";
import { monthBasedSearchBookings } from "@/lib/services/bookingSearchCore";

export type PostponedBookingRow = ReturnType<typeof serializeStandardBookingDetails> & {
  id: number;
  serial: number;
  status: string;
  total_advance: number;
  postponed_at: string | null;
};

function serializePostponedRow(b: {
  id: number;
  monthlySerial: number;
  status: string;
  totalAdvance: number;
  advance: number;
  postponedAt?: Date | null;
  deliveryDate: Date;
  returnDate: Date;
  bookingItems: Array<{
    dressName: string;
    category?: string | null;
    size?: string | null;
    notes?: string | null;
    item?: { size?: string | null } | null;
  }>;
  legacyItem?: { size?: string | null; category?: string | null } | null;
  dressName?: string | null;
  [key: string]: unknown;
}): PostponedBookingRow {
  const details = serializeStandardBookingDetails(b);
  return {
    ...details,
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
  const result = await monthBasedSearchBookings(queryText, date, "", page, pageSize);
  return {
    ...result,
    results: result.results.filter((r) => r.status === "booked"),
  };
}

export async function listPostponedBookings(searchQ?: string) {
  const q = (searchQ || "").trim().toLowerCase();
  const rows = await prisma.booking.findMany({
    where: { status: "postponed" },
    include: {
      bookingItems: { include: { item: { select: { size: true } } } },
      legacyItem: { select: { size: true, category: true } },
    },
    orderBy: [{ createdAt: "desc" }, { monthlySerial: "desc" }],
  });

  let list = rows.map((b) => serializePostponedRow(b));
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
    const itemIds = booking.bookingItems.map((bi) => bi.itemId);
    const stillUsed = await findItemIdsStillInActiveBookings(itemIds, bookingId, tx);
    for (const bi of booking.bookingItems) {
      if (!stillUsed.has(bi.itemId)) {
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

  const dateRows = await prisma.$queryRaw<{ postponed_at: Date | null }[]>`
    SELECT postponed_at FROM bookings WHERE id = ${bookingId}
  `;
  const postponedAtRaw = dateRows[0]?.postponed_at;

  return {
    booking,
    lineItems,
    totalAdvance: booking.totalAdvance || booking.advance || 0,
    postponedAt: postponedAtRaw
      ? formatDate(postponedAtRaw, "display")
      : formatDate(new Date(), "display"),
  };
}
