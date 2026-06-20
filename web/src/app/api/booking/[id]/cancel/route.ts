import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { cancelBooking } from "@/lib/services/operations";
import { bookingLockedMessage, isBookingLocked } from "@/lib/bookingLock";
import { jsonError, jsonOk, requireUser, isResponse } from "@/lib/api";
import { isOwner } from "@/lib/auth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    const body = await req.json().catch(() => ({}));
    const refundAmount = Number(body.refund_amount) || 0;
    await cancelBooking(bookingId, refundAmount, user.username);
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed to cancel booking");
  }
}
