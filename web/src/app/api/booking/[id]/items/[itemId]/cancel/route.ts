import { NextRequest, after } from "next/server";
import { cancelBookingItem } from "@/lib/services/operations";
import { jsonError, jsonOk, requireUser, isResponse, requireJsonContentType } from "@/lib/api";
import { triggerCancellationWhatsApp } from "@/lib/services/whatsapp/cancellationWhatsApp";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const _ct = requireJsonContentType(req);
  if (_ct) return _ct;

  const user = await requireUser();
  if (isResponse(user)) return user;

  const { id, itemId } = await params;
  const bookingId = parseInt(id, 10);
  const bookingItemId = parseInt(itemId, 10);
  if (!bookingId || !bookingItemId) return jsonError("Invalid request", 400);

  try {
    const body = await req.json().catch(() => ({}));
    const refundAdvance =
      body.refund_advance === true ||
      body.refundAdvance === true ||
      String(body.option || "").toLowerCase() === "refunded";

    const booking = await cancelBookingItem(
      bookingId,
      bookingItemId,
      { refundAdvance },
      user.username,
    );

    if (booking?.status === "cancelled") {
      after(async () => {
        await triggerCancellationWhatsApp(bookingId, {
          refundAmount: booking.refundAmount ?? undefined,
          createdBy: user.username,
        });
      });
    }

    return jsonOk({
      ok: true,
      id: booking?.id,
      status: booking?.status,
      totalAdvance: booking?.totalAdvance,
      totalPrice: booking?.totalPrice,
      totalRemaining: booking?.totalRemaining,
      refundAmount: booking?.refundAmount,
      items: booking?.bookingItems?.map((bi) => ({
        id: bi.id,
        dressName: bi.dressName,
        isCancelled: bi.isCancelled,
        cancelRefundAmount: bi.cancelRefundAmount,
        isDelivered: bi.isDelivered,
        isReturned: bi.isReturned,
        advance: bi.advance,
        remaining: bi.remaining,
        price: bi.price,
      })),
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Cancel failed");
  }
}
