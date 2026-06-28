import prisma from "@/lib/prisma";
import {
  deliveredBookingItems,
  isCommonDeliverySlipEligible,
  isIncompleteSlipEligible,
  returnedBookingItems,
} from "@/lib/bookingStatus";
import {
  scheduleDeliverySlip,
  scheduleIncompleteSlip,
  scheduleReturnReceipt,
  scheduleReturnSlip,
  processWhatsAppJobQueue,
} from "./jobQueue";

export type SlipScope = "full" | "single" | "combined";

function resolveDeliveryScope(booking: {
  status: string;
  bookingItems?: Array<{ id: number; isDelivered: boolean }>;
}): { scope: SlipScope; bookingItemId?: number } | null {
  const delivered = deliveredBookingItems(booking);
  if (delivered.length === 0) return null;

  if (isCommonDeliverySlipEligible(booking)) {
    return { scope: "full" };
  }
  if (delivered.length === 1) {
    const id = delivered[0].id;
    if (id == null) return null;
    return { scope: "single", bookingItemId: id };
  }
  return { scope: "combined" };
}

function resolvePartialReturnScope(booking: {
  status: string;
  bookingItems?: Array<{ id: number; isDelivered?: boolean; isReturned?: boolean; isIncompleteReturn?: boolean }>;
}): { scope: SlipScope; bookingItemId?: number } | null {
  const returned = returnedBookingItems(booking);
  if (returned.length === 0) return null;

  if (returned.length === 1) {
    const id = returned[0].id;
    if (id == null) return null;
    return { scope: "single", bookingItemId: id };
  }
  return { scope: "combined" };
}

/** Queue delivery slip WhatsApp after dress(es) marked delivered. */
export async function scheduleDeliverySlipsForBooking(
  bookingId: number,
  requestOrigin?: string,
  createdBy?: string,
) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { bookingItems: true },
  });
  if (!booking) return;

  const resolved = resolveDeliveryScope(booking);
  if (!resolved) return;

  await scheduleDeliverySlip(
    bookingId,
    {
      scope: resolved.scope,
      bookingItemId: resolved.bookingItemId,
    },
    requestOrigin,
    createdBy,
  );
}

/** Queue return / incomplete slip WhatsApp after return actions. */
export async function scheduleReturnSlipsForBooking(
  bookingId: number,
  requestOrigin?: string,
  createdBy?: string,
) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { bookingItems: true },
  });
  if (!booking) return;

  if (booking.status === "returned") {
    await scheduleReturnReceipt(bookingId, requestOrigin, createdBy);
    return;
  }

  const partial = resolvePartialReturnScope(booking);
  if (partial) {
    await scheduleReturnSlip(
      bookingId,
      {
        scope: partial.scope,
        bookingItemId: partial.bookingItemId,
      },
      requestOrigin,
      createdBy,
    );
  }

  if (isIncompleteSlipEligible(booking)) {
    await scheduleIncompleteSlip(bookingId, requestOrigin, createdBy);
  }
}

/** Schedule jobs and process queue immediately (best-effort). */
export async function triggerWhatsAppSlipJobs(
  bookingId: number,
  kind: "delivery" | "return",
  requestOrigin?: string,
  createdBy?: string,
) {
  if (kind === "delivery") {
    await scheduleDeliverySlipsForBooking(bookingId, requestOrigin, createdBy);
  } else {
    await scheduleReturnSlipsForBooking(bookingId, requestOrigin, createdBy);
  }
  void processWhatsAppJobQueue(10).catch((e) => {
    console.error("[triggerWhatsAppSlipJobs] queue error:", e);
  });
}
