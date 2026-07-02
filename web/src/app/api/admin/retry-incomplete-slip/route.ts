import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { jsonError, jsonOk, requireOwner, isResponse } from "@/lib/api";
import { sendIncompleteSlipWhatsApp } from "@/lib/services/whatsapp/automatedMessages";

/** Owner-only: resend incomplete slip for a booking (e.g. after filename fix). */
export async function POST(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  try {
    const body = await req.json();
    const bookingId = parseInt(String(body.booking_id || ""), 10);
    if (!bookingId) return jsonError("booking_id required");

    await prisma.bookingItem.updateMany({
      where: { bookingId, isIncompleteReturn: true },
      data: { returnSlipNotifiedAt: null },
    });

    const result = await sendIncompleteSlipWhatsApp(
      bookingId,
      { scope: "combined", bookingItemIds: [] },
      req.nextUrl.origin,
    );

    return jsonOk({ ok: result.ok, ...result });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Retry failed", 500);
  }
}
