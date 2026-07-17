import { NextRequest, after } from "next/server";
import { saveDelivery } from "@/lib/services/operations";
import { jsonError, jsonOk, requireUser, isResponse, requireJsonContentType } from "@/lib/api";
import { finalizeSlipTrigger } from "@/lib/services/whatsapp/slipDebounce";
import { processWhatsAppJobQueue } from "@/lib/services/whatsapp/jobQueue";
import { createPerfTimer, withServerTiming } from "@/lib/perfTiming";
import {
  assertSamePayloadOrThrow,
  hashRequestPayload,
} from "@/lib/mutationIdempotency";
import prisma from "@/lib/prisma";

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
        : null;
    const requestHash = hashRequestPayload({
      bookingId,
      remaining_collected: Number(body.remaining_collected || 0),
      security_collected: Number(body.security_collected || 0),
      delivery_notes: body.delivery_notes || "",
      mark_delivered: Boolean(body.mark_delivered),
      payment_mode: body.payment_mode,
      security_payment_mode: body.security_payment_mode,
      items: body.items,
    });

    if (operationId) {
      try {
        const existing = await prisma.mutationReceipt.findUnique({
          where: { operationId },
        });
        if (existing) {
          assertSamePayloadOrThrow(existing.requestHash, {
            bookingId,
            remaining_collected: Number(body.remaining_collected || 0),
            security_collected: Number(body.security_collected || 0),
            delivery_notes: body.delivery_notes || "",
            mark_delivered: Boolean(body.mark_delivered),
            payment_mode: body.payment_mode,
            security_payment_mode: body.security_payment_mode,
            items: body.items,
          });
          const timings = perf.finish({ kind: "mutation" });
          return withServerTiming(
            jsonOk({ ...(existing.resultJson as object), reused: true }),
            timings,
          );
        }
      } catch (e) {
        // Table may not exist until migration is deployed — continue without receipt.
        if (process.env.PERF_LOG_ALL === "1") {
          console.log("[delivery save] mutation receipt lookup skipped");
        }
      }
    }

    perf.mark("tx");
    const booking = await saveDelivery(
      bookingId,
      {
        remaining_collected: Number(body.remaining_collected || 0),
        security_collected: Number(body.security_collected || 0),
        delivery_notes: body.delivery_notes || "",
        mark_delivered: Boolean(body.mark_delivered),
        payment_mode:
          body.payment_mode === "online" ? "online" : body.payment_mode === "cash" ? "cash" : undefined,
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

    const itemRows = (booking.bookingItems || []).map((bi) => ({
      id: bi.id,
      isDelivered: bi.isDelivered,
      itemRemainingCollected: bi.itemRemainingCollected,
      itemSecurityCollected: bi.itemSecurityCollected,
      itemDeliveryNotes: bi.itemDeliveryNotes,
    }));

    const payload = {
      ok: true,
      id: booking.id,
      status: booking.status,
      items: itemRows,
      slip_queued: slipQueued,
    };

    if (operationId) {
      try {
        await prisma.mutationReceipt.create({
          data: {
            operationId,
            operationType: "delivery_save",
            bookingId,
            actorUserId: user.id,
            requestHash,
            status: "completed",
            resultJson: payload,
            completedAt: new Date(),
          },
        });
      } catch (e) {
        // Unique race: another request finished — return that result if same payload
        const raced = await prisma.mutationReceipt.findUnique({ where: { operationId } });
        if (raced) {
          assertSamePayloadOrThrow(raced.requestHash, {
            bookingId,
            remaining_collected: Number(body.remaining_collected || 0),
            security_collected: Number(body.security_collected || 0),
            delivery_notes: body.delivery_notes || "",
            mark_delivered: Boolean(body.mark_delivered),
            payment_mode: body.payment_mode,
            security_payment_mode: body.security_payment_mode,
            items: body.items,
          });
          const timings = perf.finish({ kind: "mutation" });
          return withServerTiming(
            jsonOk({ ...(raced.resultJson as object), reused: true }),
            timings,
          );
        }
        console.error("[delivery save] mutation receipt error:", e);
      }
    }

    const timings = perf.finish({ kind: "mutation" });
    return withServerTiming(jsonOk(payload), timings);
  } catch (e) {
    perf.finish({ kind: "mutation", forceLog: true });
    return jsonError(e instanceof Error ? e.message : "Save failed");
  }
}
