import "server-only";

import prisma from "@/lib/prisma";
import { createBooking, type BookingFormInput } from "@/lib/services/bookingCrud";
import {
  scheduleBookingBill,
  processWhatsAppJobQueue,
} from "@/lib/services/whatsapp/jobQueue";
import {
  createBookingWithSideEffectsCore,
  type BookingCreateCoreDeps,
  type BookingCreateResult,
} from "@/lib/services/bookingCreateOrchestration.core";

export type { BookingCreateResult };

export async function createBookingWithSideEffects(
  input: BookingFormInput & { client_request_id?: string },
  user: { id: number; username: string },
  overrides: Partial<BookingCreateCoreDeps> = {},
  opts?: { nextAfter?: (fn: () => void | Promise<void>) => void; origin?: string },
): Promise<BookingCreateResult> {
  const origin = opts?.origin || "";
  const deps: BookingCreateCoreDeps = {
    createBooking: (form, by) => createBooking(form as BookingFormInput, by),
    scheduleBookingBill: (bookingId, _o, createdBy) =>
      scheduleBookingBill(bookingId, origin || _o, createdBy),
    processWhatsAppJobQueue,
    findIdempotent: async (key) => {
      const row = await prisma.bookingIdempotencyKey.findUnique({
        where: { key },
        select: { booking: { select: { id: true, monthlySerial: true } } },
      });
      return row?.booking ?? null;
    },
    saveIdempotent: async (key, bookingId, userId) => {
      await prisma.bookingIdempotencyKey.create({
        data: { key, bookingId, userId },
      });
    },
    after: opts?.nextAfter ?? ((fn) => {
      void fn();
    }),
    ...overrides,
  };

  return createBookingWithSideEffectsCore(input, user, deps);
}
