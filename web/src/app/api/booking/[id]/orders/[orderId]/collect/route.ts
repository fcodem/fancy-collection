import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { jsonError, jsonOk, requireUser, isResponse, requireJsonContentType } from "@/lib/api";
import { broadcastShopEvent } from "@/lib/realtime/broadcast";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; orderId: string }> },
) {
  const _ct = requireJsonContentType(req);
  if (_ct) return _ct;

  const user = await requireUser();
  if (isResponse(user)) return user;

  const { id, orderId } = await params;
  const bookingId = parseInt(id, 10);
  const oid = parseInt(orderId, 10);
  if (!bookingId || !oid) return jsonError("Invalid request", 400);

  const order = await prisma.bookingOrder.findUnique({ where: { id: oid } });
  if (!order || order.bookingId !== bookingId) return jsonError("Order not found", 404);
  if (order.status !== "active") return jsonError("Order is cancelled", 400);

  let body: { balance_collected?: number; payment_mode?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body is fine — default to full balance */
  }

  const outstanding = Math.max(0, order.balance - order.balanceCollected);
  const requested = typeof body.balance_collected === "number" ? body.balance_collected : outstanding;
  const collected = Math.max(0, Math.min(requested, outstanding));
  const paymentMode = body.payment_mode === "online" ? "online" : "cash";

  const updated = await prisma.bookingOrder.update({
    where: { id: oid },
    data: {
      balanceCollected: order.balanceCollected + collected,
      collectedAt: new Date(),
      collectPaymentMode: paymentMode,
    },
  });

  broadcastShopEvent({ type: "booking.updated", bookingId, status: "order_collected", by: user.username });

  return jsonOk({
    ok: true,
    order: {
      id: updated.id,
      balanceCollected: updated.balanceCollected,
      collectedAt: updated.collectedAt,
    },
  });
}
