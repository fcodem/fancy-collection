import { NextRequest, after } from "next/server";
import { saveDelivery } from "@/lib/services/operations";
import { jsonError, jsonOk, requireUser, isResponse, requireJsonContentType } from "@/lib/api";
import { finalizeSlipTrigger } from "@/lib/services/whatsapp/slipDebounce";
import { processWhatsAppJobQueue } from "@/lib/services/whatsapp/jobQueue";
import { createPerfTimer, withServerTiming } from "@/lib/perfTiming";
import {
  MutationIdempotencyError,
  runIdempotentMutation,
} from "@/lib/mutationReceipt";

export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const perf = createPerfTimer("POST /api/booking-delivery/[id]/save");
  const _ct = requireJsonContentType(req);
  if (_ct) return _ct;

  perf.mark("auth");
  const user = await requireUser();
  perf.endStage("authMs", "auth");
  if (isResponse(user)) return user;
  const { id } = await params;
  const bookingId = parseInt(id, 10);
  try {
    perf.mark("parse");
    const body = await req.json();
    perf.endStage("parseMs", "parse");

    const operationId =
      typeof body.operation_id === "string" && body.operation_id.trim()
        ? body.operation_id.trim()
        : "";

    const canonicalPayload = {
      bookingId,
      remaining_collected: Number(body.remaining_collected || 0),
      security_collected: Number(body.security_collected || 0),
      delivery_notes: body.delivery_notes || "",
      mark_delivered: Boolean(body.mark_delivered),
      payment_mode: body.payment_mode,
      security_payment_mode: body.security_payment_mode,
      items: body.items,
    };

    const { result: payload, reused } = await runIdempotentMutation(
      {
        operationId,
        operationType: "delivery_save",
        bookingId,
        actorUserId: user.id,
        payload: canonicalPayload,
      },
      async () => {
        perf.mark("tx");
        const booking = await saveDelivery(
          bookingId,
          {
            remaining_collected: Number(body.remaining_collected || 0),
            security_collected: Number(body.security_collected || 0),
            delivery_notes: body.delivery_notes || "",
            mark_delivered: Boolean(body.mark_delivered),
            payment_mode:
              body.payment_mode === "online"
                ? "online"
                : body.payment_mode === "cash"
                  ? "cash"
                  : undefined,
            security_payment_mode:
              body.security_payment_mode === "online"
                ? "online"
                : body.security_payment_mode === "cash"
                  ? "cash"
                  : undefined,
            items: Array.isArray(body.items)
              ? body.items.map((it: Record<string, unknown>) => ({
                  booking_item_id: Number(it.booking_item_id),
                  remaining_collected: Number(it.remaining_collected || 0),
                  security_collected: Number(it.security_collected || 0),
                  delivery_notes: String(it.delivery_notes || ""),
                  mark_delivered: Boolean(it.mark_delivered),
                }))
              : undefined,
          },
          user.username,
        );
        perf.endStage("transactionMs", "tx");

        const deliveryItemIds =
          (booking as { newlyDeliveredItemIds?: number[] }).newlyDeliveredItemIds ?? [];

        let slipQueued = false;
        if (deliveryItemIds.length > 0) {
          perf.mark("job");
          try {
            await finalizeSlipTrigger(bookingId, "delivery", {
              requestOrigin: req.nextUrl.origin,
              createdBy: user.username,
              deliveryItemIds,
            });
            slipQueued = true;
            after(async () => {
              try {
                await processWhatsAppJobQueue(2, { bookingId });
              } catch (e) {
                console.error("[delivery save] whatsapp queue error:", e);
              }
            });
          } catch (e) {
            console.error("[delivery save] WhatsApp slip error:", e);
          }
          perf.endStage("jobEnqueueMs", "job");
        }

        return {
          ok: true,
          id: booking.id,
          status: booking.status,
          items: (booking.bookingItems || []).map((bi) => ({
            id: bi.id,
            isDelivered: bi.isDelivered,
            itemRemainingCollected: bi.itemRemainingCollected,
            itemSecurityCollected: bi.itemSecurityCollected,
            itemDeliveryNotes: bi.itemDeliveryNotes,
          })),
          slip_queued: slipQueued,
        };
      },
    );

    const timings = perf.finish({ kind: "mutation" });
    return withServerTiming(jsonOk({ ...payload, reused: reused || undefined }), timings);
  } catch (e) {
    perf.finish({ kind: "mutation", forceLog: true });
    if (e instanceof MutationIdempotencyError) {
      return jsonError(e.message, e.httpStatus);
    }
    return jsonError(e instanceof Error ? e.message : "Save failed");
  }
}
