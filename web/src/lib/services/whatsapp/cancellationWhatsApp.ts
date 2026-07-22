import "server-only";

import {
  processWhatsAppJobQueue,
  scheduleCancellationNotice,
} from "./jobQueue";

/** Queue and process a cancellation WhatsApp notice for the customer. */
export async function triggerCancellationWhatsApp(
  bookingId: number,
  opts?: { refundAmount?: number; createdBy?: string },
): Promise<{ queued: boolean; jobId?: number }> {
  const job = await scheduleCancellationNotice(
    bookingId,
    { refundAmount: opts?.refundAmount },
    opts?.createdBy,
  );
  if (!job) return { queued: false };

  try {
    await processWhatsAppJobQueue(2, { bookingId });
  } catch (e) {
    console.error("[cancellation] WhatsApp queue error:", e);
  }

  return { queued: true, jobId: job.id };
}
