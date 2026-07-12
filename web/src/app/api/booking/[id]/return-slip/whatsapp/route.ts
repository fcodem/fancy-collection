import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { jsonError, jsonOk, requireUser, isResponse } from "@/lib/api";
import { scheduleReturnSlip, processWhatsAppJobQueue } from "@/lib/services/whatsapp/jobQueue";
import { isWhatsAppConfigured, isWhatsAppReceiptsDisabled } from "@/lib/services/whatsapp/metaApi";
import { resolvePublicBookingId } from "@/lib/services/whatsapp/publicBookingId";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { resolvePartialReturnScope, parseBookingItemIdsParam } from "@/lib/slipDelta";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (isResponse(user)) return user;

  const { id } = await params;
  const bookingId = parseInt(id, 10);

  let body: { item?: string | number; items?: string | number[] } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const itemFromQuery = req.nextUrl.searchParams.get("item");
  const itemsFromQuery = req.nextUrl.searchParams.get("items");
  const explicitIds =
    parseBookingItemIdsParam(
      Array.isArray(body.items)
        ? body.items.join(",")
        : typeof body.items === "string"
          ? body.items
          : itemsFromQuery,
    ) ??
    (body.item != null || itemFromQuery
      ? [Number(body.item ?? itemFromQuery)].filter((n) => n > 0)
      : undefined);

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      bookingItems: {
        select: {
          id: true,
          isDelivered: true,
          isReturned: true,
          isIncompleteReturn: true,
          isCancelled: true,
          returnSlipNotifiedAt: true,
        },
      },
    },
  });
  if (!booking) return jsonError("Booking not found", 404);

  const scope = resolvePartialReturnScope(
    {
      bookingItems: booking.bookingItems.map((bi) => ({
        ...bi,
        // Allow resend from the slip page.
        returnSlipNotifiedAt: null,
      })),
    },
    explicitIds,
  );

  if (!scope) {
    return jsonError("No returned dresses on this booking — mark return first", 400);
  }

  const phoneRaw = booking.whatsappNo || booking.contact1;
  if (!phoneRaw?.trim()) return jsonError("No WhatsApp number on this booking");

  if (isWhatsAppReceiptsDisabled()) {
    return jsonOk({
      ok: true,
      delivered: false,
      paused: true,
      message: "WhatsApp receipts are temporarily paused (WHATSAPP_RECEIPTS_DISABLED).",
    });
  }

  if (!isWhatsAppConfigured()) {
    const publicId = resolvePublicBookingId(booking);
    const message = `Your return receipt (${publicId}) will be sent once WhatsApp API is configured.`;
    return jsonOk({
      ok: true,
      delivered: false,
      via: "manual",
      whatsappUrl: buildWhatsAppUrl(phoneRaw, message),
      message,
    });
  }

  await prisma.bookingItem.updateMany({
    where: { id: { in: scope.bookingItemIds } },
    data: { returnSlipNotifiedAt: null },
  });

  const job = await scheduleReturnSlip(
    bookingId,
    {
      scope: scope.scope,
      bookingItemId: scope.bookingItemId,
      bookingItemIds: scope.bookingItemIds,
    },
    req.nextUrl.origin,
    user.username,
  );

  let queueSummary;
  try {
    queueSummary = await processWhatsAppJobQueue(3, { bookingId });
  } catch (e) {
    console.error("[return-slip whatsapp POST] queue error:", e);
    return jsonError(e instanceof Error ? e.message : "Failed to send return slip");
  }

  const sent = (queueSummary?.succeeded ?? 0) > 0;
  return jsonOk({
    ok: true,
    queued: true,
    sent,
    job_id: job?.id ?? null,
    message: sent
      ? "Return slip sent to WhatsApp."
      : "Return slip queued — run the job queue if it was not sent.",
  });
}
