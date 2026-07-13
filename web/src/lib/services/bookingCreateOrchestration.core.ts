/**
 * Pure booking create orchestration — no Prisma / server-only imports.
 * Atomically relies on unique client_request_id inside createBooking's DB transaction.
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
  createBooking: (
    input: BookingFormLike,
    by?: string,
  ) => Promise<{ id: number; monthlySerial: number }>;
  scheduleBookingBill: (
    bookingId: number,
    origin: string,
    createdBy?: string,
  ) => Promise<unknown>;
  processWhatsAppJobQueue: (
    limit?: number,
    opts?: { bookingId?: number },
  ) => Promise<unknown>;
  /** Lookup winner when createBooking throws unique-constraint on client_request_id. */
  findByClientRequestId: (key: string) => Promise<{ id: number; monthlySerial: number } | null>;
  after: (fn: () => void | Promise<void>) => void;
  isClientRequestIdConflict?: (err: unknown) => boolean;
};

export function isPrismaClientRequestIdConflict(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; meta?: { target?: string[] | string } };
  if (e.code !== "P2002") return false;
  const target = e.meta?.target;
  if (!target) return true; // unique conflict — assume client request when caller expects it
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

  let booking: { id: number; monthlySerial: number };
  try {
    booking = await d.createBooking(input, user.username);
  } catch (e) {
    if (key && detectConflict(e)) {
      const existing = await d.findByClientRequestId(key);
      if (existing) {
        // Losing transaction was rolled back by the DB — do not schedule WhatsApp/PDF.
        return { id: existing.id, serial: existing.monthlySerial, reused: true };
      }
    }
    throw e;
  }

  try {
    await d.scheduleBookingBill(booking.id, "", user.username);
  } catch (e) {
    console.error("[booking] scheduleBookingBill failed (booking kept):", e);
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
