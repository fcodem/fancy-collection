import "server-only";

import type { BookingFormInput } from "@/lib/services/bookingCrud";
import {
  createBookingFast,
  findBookingCreateOperation,
  type BookingCreateTimings,
} from "@/lib/services/bookingCreateFast";
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
  opts?: {
    nextAfter?: (fn: () => void | Promise<void>) => void;
    origin?: string;
    onTiming?: (timings: BookingCreateTimings) => void;
  },
): Promise<BookingCreateResult> {
  const origin = opts?.origin || "";
  const deps: BookingCreateCoreDeps = {
    createBooking: (form, by) =>
      createBookingFast(
        form as BookingFormInput,
        by,
        origin,
        opts?.onTiming,
      ),
    // Keep PDF/WhatsApp/Chromium modules out of the request bundle and import
    // the worker graph only after the response has been committed.
    processWhatsAppJobQueue: async (limit, queueOpts) => {
      const { processWhatsAppJobQueue } = await import(
        "@/lib/services/whatsapp/jobQueue"
      );
      return processWhatsAppJobQueue(limit, queueOpts);
    },
    findByClientRequestId: (key, form) =>
      findBookingCreateOperation(key, form as BookingFormInput),
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
