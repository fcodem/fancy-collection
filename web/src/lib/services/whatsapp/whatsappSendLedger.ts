import prisma from "@/lib/prisma";

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
