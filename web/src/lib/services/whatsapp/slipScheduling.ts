import prisma from "@/lib/prisma";
import {
  resolveDeliveryScope,
  resolvePartialReturnScope,
  resolveIncompleteScope,
} from "@/lib/slipDelta";
import {
  scheduleDeliverySlip,
  scheduleIncompleteSlip,
  scheduleReturnSlip,
  processWhatsAppJobQueue,
} from "./jobQueue";
import { isWhatsAppReceiptsDisabled } from "./metaApi";

export type { SlipScope } from "@/lib/slipDelta";

export type SlipJobTriggerOptions = {
  requestOrigin?: string;
  createdBy?: string;
  deliveryItemIds?: number[];
  returnItemIds?: number[];
  incompleteItemIds?: number[];
};

export async function scheduleDeliverySlipsForBooking(
  bookingId: number,
  opts?: SlipJobTriggerOptions,
) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { bookingItems: true },
  });
  if (!booking) return;

  const resolved = resolveDeliveryScope(booking, opts?.deliveryItemIds);
  if (!resolved) return;

  await scheduleDeliverySlip(
    bookingId,
    {
      scope: resolved.scope,
      bookingItemId: resolved.bookingItemId,
      bookingItemIds: resolved.bookingItemIds,
    },
    opts?.requestOrigin,
    opts?.createdBy,
  );
}

export async function scheduleReturnSlipsForBooking(
  bookingId: number,
  opts?: SlipJobTriggerOptions,
) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { bookingItems: true },
  });
  if (!booking) return;

  const partial = resolvePartialReturnScope(booking, opts?.returnItemIds);
  if (partial) {
    await scheduleReturnSlip(
      bookingId,
      {
        scope: partial.scope,
        bookingItemId: partial.bookingItemId,
        bookingItemIds: partial.bookingItemIds,
      },
      opts?.requestOrigin,
      opts?.createdBy,
    );
  }

  const incomplete = resolveIncompleteScope(booking, opts?.incompleteItemIds);
  if (incomplete) {
    await scheduleIncompleteSlip(
      bookingId,
      {
        scope: incomplete.scope,
        bookingItemId: incomplete.bookingItemId,
        bookingItemIds: incomplete.bookingItemIds,
      },
      opts?.requestOrigin,
      opts?.createdBy,
    );
  }
}

export async function triggerWhatsAppSlipJobs(
  bookingId: number,
  kind: "delivery" | "return",
  opts?: SlipJobTriggerOptions,
) {
  if (isWhatsAppReceiptsDisabled()) return;
  if (kind === "delivery") {
    await scheduleDeliverySlipsForBooking(bookingId, opts);
  } else {
    await scheduleReturnSlipsForBooking(bookingId, opts);
  }
  try {
    return await processWhatsAppJobQueue(5, { bookingId });
  } catch (e) {
    console.error("[triggerWhatsAppSlipJobs] queue error:", e);
    throw e;
  }
}
