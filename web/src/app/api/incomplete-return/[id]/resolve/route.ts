import { NextRequest, after } from "next/server";
import { resolveIncompleteReturn } from "@/lib/services/operations";
import { jsonError, jsonOk, requireUser, isResponse } from "@/lib/api";
import { triggerWhatsAppSlipJobs } from "@/lib/services/whatsapp/slipScheduling";
import { processWhatsAppJobQueue } from "@/lib/services/whatsapp/jobQueue";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id } = await params;
  const bookingId = parseInt(id, 10);
  const booking = await resolveIncompleteReturn(bookingId, user.username);
  if (!booking) return jsonError("Booking not found or not incomplete", 404);
  if (booking.status === "returned") {
    try {
      await triggerWhatsAppSlipJobs(bookingId, "return", {
        requestOrigin: req.nextUrl.origin,
        createdBy: user.username,
      });
      after(async () => {
        try {
          await processWhatsAppJobQueue(2, { bookingId });
        } catch (e) {
          console.error("[incomplete-return resolve] whatsapp queue error:", e);
        }
      });
    } catch (e) {
      console.error("[incomplete-return resolve] WhatsApp slip error:", e);
    }
  }
  return jsonOk({ ok: true, id: booking.id, security_held: booking.securityHeld });
}
