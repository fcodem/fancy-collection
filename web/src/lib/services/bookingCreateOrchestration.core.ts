/**
 * Pure booking create orchestration — no Prisma / server-only imports.
 * Used by API routes (with deps) and unit tests (with mocks).
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
  findIdempotent: (key: string) => Promise<{ id: number; monthlySerial: number } | null>;
  saveIdempotent: (key: string, bookingId: number, userId: number) => Promise<void>;
  after: (fn: () => void | Promise<void>) => void;
};

export async function createBookingWithSideEffectsCore(
  input: BookingFormLike,
  user: { id: number; username: string },
  d: BookingCreateCoreDeps,
): Promise<BookingCreateResult> {
  const key = typeof input.client_request_id === "string" ? input.client_request_id.trim() : "";
  if (key) {
    const existing = await d.findIdempotent(key);
    if (existing) {
      return { id: existing.id, serial: existing.monthlySerial, reused: true };
    }
  }

  const booking = await d.createBooking(input, user.username);

  if (key) {
    try {
      await d.saveIdempotent(key, booking.id, user.id);
    } catch (e) {
      const raced = await d.findIdempotent(key);
      if (raced) {
        return { id: raced.id, serial: raced.monthlySerial, reused: true };
      }
      console.error("[booking] idempotency key save failed:", e);
    }
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
