import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { jsonError, jsonOk, requireUser, isResponse } from "@/lib/api";
import { broadcastShopEvent } from "@/lib/realtime/broadcast";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; orderId: string }> },
) {
  const user = await requireUser();
  if (isResponse(user)) return user;

  const { id, orderId } = await params;
  const bookingId = parseInt(id, 10);
  const oid = parseInt(orderId, 10);
  if (!bookingId || !oid) return jsonError("Invalid request", 400);

  const order = await prisma.bookingOrder.findUnique({ where: { id: oid } });
  if (!order || order.bookingId !== bookingId) return jsonError("Order not found", 404);
  if (order.status !== "active") return jsonError("Order is cancelled", 400);

  let body: { ready?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body — default to marking ready */
  }
  const ready = body.ready !== false;

  const updated = await prisma.bookingOrder.update({
    where: { id: oid },
    data: { readyAt: ready ? new Date() : null },
  });

  broadcastShopEvent({
    type: "booking.updated",
    bookingId,
    status: ready ? "order_ready" : "order_not_ready",
    by: user.username,
  });

  return jsonOk({ ok: true, order: { id: updated.id, readyAt: updated.readyAt } });
}
