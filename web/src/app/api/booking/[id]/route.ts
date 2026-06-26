import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { updateBooking, type BookingFormInput } from "@/lib/services/bookingCrud";
import { cancelBooking } from "@/lib/services/operations";
import { serializeBookingForList } from "@/lib/booking";
import { bookingLockedMessage, isBookingLocked } from "@/lib/bookingLock";
import {
  shouldResendWhatsAppOnUpdate,
  triggerBookingWhatsAppAsync,
} from "@/lib/services/bookingWhatsAppFlow";
import { jsonError, jsonOk, requireUser, isResponse } from "@/lib/api";
import { isOwner } from "@/lib/auth";
import { BookingFormSchema } from "@/lib/validation";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id } = await params;
  const booking = await prisma.booking.findUnique({
    where: { id: parseInt(id, 10) },
    include: { bookingItems: { include: { item: true } }, legacyItem: true },
  });
  if (!booking) return jsonError("Not found", 404);
  return jsonOk(serializeBookingForList(booking));
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id } = await params;
  const bookingId = parseInt(id, 10);
  const existing = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { status: true, whatsappNo: true, contact1: true },
  });
  if (!existing) return jsonError("Not found", 404);
  if (isBookingLocked(existing.status) && !isOwner(user)) {
    return jsonError(bookingLockedMessage(), 403);
  }
  try {
    const raw = await req.json();
    const parseResult = BookingFormSchema.partial().safeParse(raw);
    if (!parseResult.success) {
      return jsonError(parseResult.error.issues[0]?.message || "Invalid input", 400);
    }
    const body = parseResult.data as BookingFormInput;
    const booking = await updateBooking(bookingId, body, user.username);

    if (
      booking &&
      shouldResendWhatsAppOnUpdate(
        existing.whatsappNo,
        existing.contact1,
        body.whatsapp_no,
        body.contact_1,
      )
    ) {
      triggerBookingWhatsAppAsync(bookingId, req.nextUrl.origin);
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
