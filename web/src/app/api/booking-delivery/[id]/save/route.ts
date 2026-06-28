import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { saveDelivery } from "@/lib/services/operations";
import { jsonError, jsonOk, requireUser, isResponse } from "@/lib/api";
import { triggerWhatsAppSlipJobs } from "@/lib/services/whatsapp/slipScheduling";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id } = await params;
  const bookingId = parseInt(id, 10);
  try {
    const body = await req.json();
    const booking = await saveDelivery(bookingId, {
      remaining_collected: Number(body.remaining_collected || 0),
      security_collected: Number(body.security_collected || 0),
      delivery_notes: body.delivery_notes || "",
      mark_delivered: Boolean(body.mark_delivered),
      payment_mode: body.payment_mode === "online" ? "online" : body.payment_mode === "cash" ? "cash" : undefined,
      security_payment_mode:
        body.security_payment_mode === "online"
          ? "online"
          : body.security_payment_mode === "cash"
            ? "cash"
            : undefined,
      items: Array.isArray(body.items) ? body.items.map((it: Record<string, unknown>) => ({
        booking_item_id: Number(it.booking_item_id),
        remaining_collected: Number(it.remaining_collected || 0),
        security_collected: Number(it.security_collected || 0),
        delivery_notes: String(it.delivery_notes || ""),
        mark_delivered: Boolean(it.mark_delivered),
      })) : undefined,
    }, user.username);

    const hadDelivery =
      Boolean(body.mark_delivered) ||
      (Array.isArray(body.items) && body.items.some((it: { mark_delivered?: boolean }) => it.mark_delivered));
    if (hadDelivery) {
      void triggerWhatsAppSlipJobs(bookingId, "delivery", req.nextUrl.origin, user.username);
    }

    const itemRows = await prisma.bookingItem.findMany({
      where: { bookingId: booking.id },
      select: {
        id: true,
        isDelivered: true,
        itemRemainingCollected: true,
        itemSecurityCollected: true,
        itemDeliveryNotes: true,
      },
    });
    return jsonOk({
      ok: true,
      id: booking.id,
      status: booking.status,
      items: itemRows.map((bi) => ({
        id: bi.id,
        isDelivered: bi.isDelivered,
        itemRemainingCollected: bi.itemRemainingCollected,
        itemSecurityCollected: bi.itemSecurityCollected,
        itemDeliveryNotes: bi.itemDeliveryNotes,
      })),
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Save failed");
  }
}
