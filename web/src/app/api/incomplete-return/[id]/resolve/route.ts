import { NextRequest } from "next/server";
import { resolveIncompleteReturn } from "@/lib/services/operations";
import { jsonError, jsonOk, requireUser, isResponse } from "@/lib/api";
import { triggerWhatsAppSlipJobs } from "@/lib/services/whatsapp/slipScheduling";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id } = await params;
  const bookingId = parseInt(id, 10);
  const booking = await resolveIncompleteReturn(bookingId, user.username);
  if (!booking) return jsonError("Booking not found or not incomplete", 404);
  if (booking.status === "returned") {
    void triggerWhatsAppSlipJobs(bookingId, "return", req.nextUrl.origin, user.username);
  }
  return jsonOk({ ok: true, id: booking.id, security_held: booking.securityHeld });
}
