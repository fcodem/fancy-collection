import "server-only";

import prisma from "@/lib/prisma";
import { formatDate } from "@/lib/constants";
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
  const row = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: bookingRecordCoreSelect,
  });
  if (!row) return null;
  return row;
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

/** Serialized shape passed to BookingViewClient (dates as display strings). */
export function serializeBookingRecordForView(
  core: NonNullable<Awaited<ReturnType<typeof loadBookingRecordCore>>>,
) {
  return {
    ...core,
    deliveryDate: formatDate(core.deliveryDate),
    returnDate: formatDate(core.returnDate),
  };
}

export function serializeBookingRecordOrders(
  orders: Awaited<ReturnType<typeof loadBookingRecordOrders>>,
): SlipOrderDisplay[] {
  return serializeActiveOrders(orders);
}
