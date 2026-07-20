import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { updateBooking } from "@/lib/services/bookingCrud";
import { cancelBooking } from "@/lib/services/operations";
import { serializeBookingForList } from "@/lib/booking";
import { bookingLockedMessage, isBookingLocked } from "@/lib/bookingLock";
import { jsonError, jsonOk, requireUser, isResponse, requireJsonContentType } from "@/lib/api";
import { isOwner } from "@/lib/auth";
import { formatDate } from "@/lib/constants";
import {
  resetLateReminderOnDateChange,
} from "@/lib/services/whatsapp/jobQueue";
import { BookingFormSchema, formatZodValidationError } from "@/lib/validation";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id } = await params;
  const booking = await prisma.booking.findUnique({
    where: { id: parseInt(id, 10) },
    include: {
      bookingItems: { include: { item: { select: { id: true, name: true, size: true, sku: true, category: true, photo: true, status: true } } } },
      legacyItem: true,
    },
  });
  if (!booking) return jsonError("Not found", 404);
  return jsonOk(serializeBookingForList(booking));
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const _ct = requireJsonContentType(req);
  if (_ct) return _ct;

  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id } = await params;
  const bookingId = parseInt(id, 10);
  const existing = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { status: true, deliveryDate: true, returnDate: true },
  });
  if (!existing) return jsonError("Not found", 404);
  if (isBookingLocked(existing.status) && !isOwner(user)) {
    return jsonError(bookingLockedMessage(), 403);
  }
  try {
    const raw = await req.json();
    const parseResult = BookingFormSchema.safeParse(raw);
    if (!parseResult.success) {
      return jsonError(formatZodValidationError(parseResult.error), 400);
    }
    const body = parseResult.data;
    const booking = await updateBooking(bookingId, body, user.username);

    const oldDeliveryIso = formatDate(existing.deliveryDate, "iso");
    const oldReturnIso = formatDate(existing.returnDate, "iso");
    const deliveryChanged = oldDeliveryIso !== body.delivery_date.slice(0, 10);
    const returnChanged = oldReturnIso !== body.return_date.slice(0, 10);

    if (deliveryChanged || returnChanged) {
      void resetLateReminderOnDateChange(bookingId).catch((e) =>
        console.error("resetLateReminderOnDateChange failed:", e),
      );
    }

    return jsonOk({ ok: true, id: booking?.id, serial: booking?.monthlySerial });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed to update booking");
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id } = await params;
  const bookingId = parseInt(id, 10);
  const existing = await prisma.booking.findUnique({ where: { id: bookingId }, select: { status: true } });
  if (!existing) return jsonError("Not found", 404);
  if (isBookingLocked(existing.status) && !isOwner(user)) {
    return jsonError(bookingLockedMessage(), 403);
  }
  try {
    await cancelBooking(bookingId, 0, user.username);
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed to cancel booking");
  }
}
