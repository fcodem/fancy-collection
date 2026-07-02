import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { jsonError, jsonOk, requireUser, isResponse } from "@/lib/api";
import { broadcastShopEvent } from "@/lib/realtime/broadcast";

export async function POST(
  _req: NextRequest,
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
  if (order.status !== "active") return jsonError("Order is already cancelled", 400);

  const refundAmount = order.advance + order.balanceCollected;
  const updated = await prisma.bookingOrder.update({
    where: { id: oid },
    data: {
      status: "cancelled",
      cancelledAt: new Date(),
      refundAmount,
    },
  });

  broadcastShopEvent({ type: "booking.updated", bookingId, status: "order_cancelled", by: user.username });

  return jsonOk({ ok: true, order: { id: updated.id, status: updated.status, refundAmount: updated.refundAmount } });
}
