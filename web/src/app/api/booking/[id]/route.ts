import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { updateBooking } from "@/lib/services/bookingCrud";
import { cancelBooking } from "@/lib/services/operations";
import { serializeBookingForList } from "@/lib/booking";
import { jsonError, jsonOk, requireUser, isResponse } from "@/lib/api";

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
  try {
    const body = await req.json();
    const booking = await updateBooking(parseInt(id, 10), body);
    return jsonOk({ ok: true, id: booking?.id, serial: booking?.monthlySerial });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed to update booking");
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id } = await params;
  try {
    await cancelBooking(parseInt(id, 10));
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed to cancel booking");
  }
}
