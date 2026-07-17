import "server-only";

import prisma from "@/lib/prisma";
import { createBooking, type BookingFormInput } from "@/lib/services/bookingCrud";
import {
  scheduleBookingBillInTx,
  processWhatsAppJobQueue,
} from "@/lib/services/whatsapp/jobQueue";
import {
  createBookingWithSideEffectsCore,
  isPrismaClientRequestIdConflict,
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
    createBooking: (form, by) =>
      createBooking(form as BookingFormInput, by, {
        scheduleBillInTx: (tx, bookingId) =>
          scheduleBookingBillInTx(tx, bookingId, origin, by),
      }),
    processWhatsAppJobQueue,
    findByClientRequestId: async (key) => {
      const row = await prisma.booking.findUnique({
        where: { clientRequestId: key },
        select: { id: true, monthlySerial: true },
      });
      return row;
    },
    isClientRequestIdConflict: isPrismaClientRequestIdConflict,
    after:
      opts?.nextAfter ??
      ((fn) => {
        void fn();
      }),
    ...overrides,
  };

  return createBookingWithSideEffectsCore(input, user, deps);
}
