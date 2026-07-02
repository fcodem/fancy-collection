import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { jsonError, jsonOk, requireOwner, isResponse } from "@/lib/api";
import {
  sendBookingBillWhatsApp,
  sendDeliverySlipWhatsApp,
  sendPartialReturnSlipWhatsApp,
  sendIncompleteSlipWhatsApp,
} from "@/lib/services/whatsapp/automatedMessages";

type SlipKind = "booking" | "delivery" | "return" | "incomplete";

/** Owner-only: resend slip PDF(s) on WhatsApp for a booking. */
export async function POST(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  try {
    const body = await req.json();
    const bookingId = parseInt(String(body.booking_id || ""), 10);
    if (!bookingId) return jsonError("booking_id required");

    const kinds: SlipKind[] = Array.isArray(body.kinds) && body.kinds.length
      ? body.kinds
      : ["incomplete"];

    const origin = req.nextUrl.origin;
    const results: Record<string, unknown> = {};

    if (kinds.includes("booking")) {
      results.booking = await sendBookingBillWhatsApp(bookingId, origin);
    }

    if (kinds.includes("delivery")) {
      await prisma.bookingItem.updateMany({
        where: { bookingId, isDelivered: true },
        data: { deliverySlipNotifiedAt: null },
      });
      results.delivery = await sendDeliverySlipWhatsApp(
        bookingId,
        { scope: "full", bookingItemIds: [] },
        origin,
      );
    }

    if (kinds.includes("return")) {
      await prisma.bookingItem.updateMany({
        where: { bookingId, isReturned: true, isIncompleteReturn: false },
        data: { returnSlipNotifiedAt: null },
      });
      const returnedIds = (
        await prisma.bookingItem.findMany({
          where: { bookingId, isReturned: true, isIncompleteReturn: false },
          select: { id: true },
        })
      ).map((r) => r.id);
      const scope =
        returnedIds.length <= 1 ? "single" : returnedIds.length > 1 ? "combined" : "full";
      results.return = await sendPartialReturnSlipWhatsApp(
        bookingId,
        {
          scope: returnedIds.length === 0 ? "full" : scope,
          bookingItemId: returnedIds.length === 1 ? returnedIds[0] : undefined,
          bookingItemIds: returnedIds,
        },
        origin,
      );
    }

    if (kinds.includes("incomplete")) {
      await prisma.bookingItem.updateMany({
        where: { bookingId, isIncompleteReturn: true },
        data: { returnSlipNotifiedAt: null },
      });
      const incompleteIds = (
        await prisma.bookingItem.findMany({
          where: { bookingId, isIncompleteReturn: true },
          select: { id: true },
        })
      ).map((r) => r.id);
      if (!incompleteIds.length) {
        results.incomplete = { ok: false, error: "No incomplete items on this booking" };
      } else {
        const scope = incompleteIds.length === 1 ? "single" : "combined";
        results.incomplete = await sendIncompleteSlipWhatsApp(
          bookingId,
          {
            scope,
            bookingItemId: incompleteIds.length === 1 ? incompleteIds[0] : undefined,
            bookingItemIds: incompleteIds,
          },
          origin,
        );
      }
    }

    const anyOk = Object.values(results).some(
      (r) => r && typeof r === "object" && "ok" in r && (r as { ok: boolean }).ok,
    );

    return jsonOk({ ok: anyOk, bookingId, results });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Resend failed", 500);
  }
}
