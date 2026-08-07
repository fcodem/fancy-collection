import prisma from "@/lib/prisma";

type LedgerReuseRow = {
  sendConfirmedAt: Date | null;
  providerMessageId: string | null;
  bookingId: number | null;
  jobId: number | null;
};

/** Only reuse ledger when it belongs to this job/booking — not stale rows after restore. */
export function canReuseWhatsAppSendLedger(
  ledger: LedgerReuseRow | null | undefined,
  job: { id: number; bookingId: number | null },
): ledger is LedgerReuseRow & { sendConfirmedAt: Date; providerMessageId: string } {
  if (!ledger?.sendConfirmedAt || !ledger.providerMessageId) return false;
  if (ledger.jobId != null && ledger.jobId !== job.id) return false;
  if (
    ledger.bookingId != null &&
    job.bookingId != null &&
    ledger.bookingId !== job.bookingId
  ) {
    return false;
  }
  return true;
}

/** Record that a Meta provider send was actually dispatched (not during PDF render). */
export async function markWhatsAppProviderSendStarted(input: {
  idempotencyKey: string;
  jobId: number;
  bookingId: number | null;
}): Promise<void> {
  try {
    await prisma.whatsAppSendLedger.upsert({
      where: { idempotencyKey: input.idempotencyKey },
      create: {
        idempotencyKey: input.idempotencyKey,
        jobId: input.jobId,
        bookingId: input.bookingId,
        sendStartedAt: new Date(),
      },
      update: {
        jobId: input.jobId,
        // Preserve first sendStartedAt — fence for unknown outcomes.
      },
    });
  } catch {
    /* ledger optional until migration */
  }
}

export async function markWhatsAppProviderSendConfirmed(input: {
  idempotencyKey: string;
  providerMessageId: string;
}): Promise<void> {
  try {
    await prisma.whatsAppSendLedger.upsert({
      where: { idempotencyKey: input.idempotencyKey },
      create: {
        idempotencyKey: input.idempotencyKey,
        providerMessageId: input.providerMessageId,
        sendConfirmedAt: new Date(),
      },
      update: {
        providerMessageId: input.providerMessageId,
        sendConfirmedAt: new Date(),
      },
    });
  } catch {
    /* ledger optional */
  }
}
