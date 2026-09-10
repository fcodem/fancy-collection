import "server-only";

import prisma from "@/lib/prisma";
import { serializeActiveOrders } from "@/lib/slipBookingData";
import {
  loadWarningItemsForBooking,
  type WarningMapBooking,
} from "@/lib/bookingWarnings";
import type { ItemWarningSource } from "@/lib/bookingWarningPdf";
import type { SlipOrderDisplay } from "@/components/BookingSlip";

export const bookingRecordOrdersSelect = {
  id: true,
  description: true,
  cost: true,
  advance: true,
  balance: true,
  deliveryDate: true,
  deliveryTime: true,
  photo: true,
  status: true,
} as const;

/** Lean booking fields for the record view — no photos, ID proofs, or AI data. */
export const bookingRecordCoreSelect = {
  id: true,
  bookingNumber: true,
  monthlySerial: true,
  status: true,
  customerName: true,
  customerAddress: true,
  contact1: true,
  whatsappNo: true,
  venue: true,
  staffNames: true,
  deliveryDate: true,
  deliveryTime: true,
  returnDate: true,
  returnTime: true,
  createdAt: true,
  totalPrice: true,
  price: true,
  totalAdvance: true,
  advance: true,
  totalRemaining: true,
  remaining: true,
  remainingCollected: true,
  securityDeposit: true,
  securityCollected: true,
  commonNotes: true,
  notes: true,
  dressName: true,
  itemId: true,
  whatsappStatus: true,
  whatsappSentAt: true,
  qrToken: true,
  bookingItems: {
    select: {
      id: true,
      itemId: true,
      dressName: true,
      category: true,
      size: true,
      notes: true,
      price: true,
      advance: true,
      remaining: true,
      isDelivered: true,
      isReturned: true,
      isIncompleteReturn: true,
      isCancelled: true,
      itemRemainingCollected: true,
      itemSecurityCollected: true,
    },
  },
  legacyItem: { select: { category: true, size: true } },
  orders: {
    where: { status: "active" as const },
    orderBy: { deliveryDate: "asc" as const },
    select: bookingRecordOrdersSelect,
  },
} as const;

export type BookingRecordCore = NonNullable<
  Awaited<ReturnType<typeof loadBookingRecordCore>>
>;

export async function loadBookingRecordCore(bookingId: number) {
  let row = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: bookingRecordCoreSelect,
  });
  if (!row) return null;
  row = (await healMissingDeliveryRemainingCollection(row)) ?? row;
  return row;
}

/**
 * Empty "Remaining Collected" on deliver was saved as ₹0 while security was entered.
 * When a delivered booking has security collected but no remaining collection recorded,
 * backfill remaining collection from each delivered dress's due remaining.
 */
export async function healMissingDeliveryRemainingCollection<
  T extends {
    id: number;
    status: string;
    remainingCollected: number | null;
    securityCollected: number | null;
    bookingItems: Array<{
      id: number;
      remaining: number;
      isDelivered: boolean;
      isCancelled: boolean;
      itemRemainingCollected: number;
      itemSecurityCollected: number;
    }>;
  },
>(booking: T): Promise<T | null> {
  if (booking.status !== "delivered" && booking.status !== "incomplete_return") return null;
  if ((booking.remainingCollected || 0) > 0) return null;

  const delivered = booking.bookingItems.filter((i) => i.isDelivered && !i.isCancelled);
  if (!delivered.length) return null;
  if (delivered.some((i) => (i.itemRemainingCollected || 0) > 0)) return null;

  const securityTaken =
    (booking.securityCollected || 0) > 0 ||
    delivered.some((i) => (i.itemSecurityCollected || 0) > 0);
  if (!securityTaken) return null;

  const dueTotal = delivered.reduce((s, i) => s + (i.remaining || 0), 0);
  if (dueTotal <= 0) return null;

  await prisma.$transaction([
    ...delivered.map((i) =>
      prisma.bookingItem.update({
        where: { id: i.id },
        data: { itemRemainingCollected: i.remaining || 0 },
      }),
    ),
    prisma.booking.update({
      where: { id: booking.id },
      data: { remainingCollected: dueTotal },
    }),
  ]);

  try {
    const { logActivity } = await import("@/lib/activityLog");
    await logActivity({
      username: "system",
      action: "updated",
      entity: "booking",
      entityId: booking.id,
      label: `Backfilled delivery remaining ₹${dueTotal} (was blank at deliver)`,
    });
  } catch {
    // Non-fatal: display heal already applied above.
  }

  return {
    ...booking,
    remainingCollected: dueTotal,
    bookingItems: booking.bookingItems.map((i) =>
      i.isDelivered && !i.isCancelled
        ? { ...i, itemRemainingCollected: i.remaining || 0 }
        : i,
    ),
  };
}

export async function loadBookingRecordOrders(bookingId: number) {
  return prisma.bookingOrder.findMany({
    where: { bookingId, status: "active" },
    select: bookingRecordOrdersSelect,
    orderBy: { deliveryDate: "asc" },
  });
}

export async function loadBookingRecordWarnings(
  booking: WarningMapBooking,
): Promise<ItemWarningSource[]> {
  return loadWarningItemsForBooking(booking);
}

/** Serialized shape passed to BookingViewClient (dates stay as Date / ISO for one format pass in UI). */
export function serializeBookingRecordForView(
  core: NonNullable<Awaited<ReturnType<typeof loadBookingRecordCore>>>,
) {
  return { ...core };
}

export function serializeBookingRecordOrders(
  orders: Awaited<ReturnType<typeof loadBookingRecordOrders>>,
): SlipOrderDisplay[] {
  return serializeActiveOrders(orders);
}
