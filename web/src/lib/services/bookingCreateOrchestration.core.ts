/**
 * Pure booking create orchestration — no Prisma / server-only imports.
 *
 * Sequential retries: look up client_request_id before createBooking so dress
 * conflict validation is not re-run after a lost response.
 * Simultaneous races: unique client_request_id inside createBooking's transaction
 * + P2002 recovery; WhatsApp bill job must be inserted in the same transaction as
 * the booking (see createBooking scheduleBillInTx) so create cannot succeed without
 * a durable outbox row.
 */

export type BookingCreateResult = {
  id: number;
  serial: number;
  reused: boolean;
};

export type BookingFormLike = {
  client_request_id?: string;
  [key: string]: unknown;
};

export type BookingCreateCoreDeps = {
  /**
   * Must schedule the booking-bill WhatsApp job inside the same DB transaction
   * as the booking insert (or fail the whole create).
   */
  createBooking: (
    input: BookingFormLike,
    by?: string,
  ) => Promise<{ id: number; monthlySerial: number }>;
  processWhatsAppJobQueue: (
    limit?: number,
    opts?: { bookingId?: number },
  ) => Promise<unknown>;
  /** Lookup by client_request_id (pre-create sequential retry + P2002 recovery). */
  findByClientRequestId: (
    key: string,
    input: BookingFormLike,
  ) => Promise<{ id: number; monthlySerial: number } | null>;
  after: (fn: () => void | Promise<void>) => void;
  isClientRequestIdConflict?: (err: unknown) => boolean;
};

export function isPrismaClientRequestIdConflict(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; meta?: { target?: string[] | string } };
  if (e.code !== "P2002") return false;
  const target = e.meta?.target;
  if (!target) return true;
  const parts = Array.isArray(target) ? target : [String(target)];
  return parts.some((t) =>
    /client_request_id|clientRequestId/i.test(String(t)),
  );
}

export async function createBookingWithSideEffectsCore(
  input: BookingFormLike,
  user: { id: number; username: string },
  d: BookingCreateCoreDeps,
): Promise<BookingCreateResult> {
  const key = typeof input.client_request_id === "string" ? input.client_request_id.trim() : "";
  const detectConflict = d.isClientRequestIdConflict ?? isPrismaClientRequestIdConflict;

  if (key) {
    const existing = await d.findByClientRequestId(key, input);
    if (existing) {
      return {
        id: existing.id,
        serial: existing.monthlySerial,
        reused: true,
      };
    }
  }

  let booking: { id: number; monthlySerial: number };
  try {
    booking = await d.createBooking(input, user.username);
  } catch (e) {
    if (key && detectConflict(e)) {
      const existing = await d.findByClientRequestId(key, input);
      if (existing) {
        return { id: existing.id, serial: existing.monthlySerial, reused: true };
      }
    }
    throw e;
  }

  d.after(async () => {
    try {
      await d.processWhatsAppJobQueue(2, { bookingId: booking.id });
    } catch (e) {
      console.error("[booking] whatsapp queue error:", e);
    }
  });

  return { id: booking.id, serial: booking.monthlySerial, reused: false };
}
