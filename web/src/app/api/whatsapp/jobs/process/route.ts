import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireOwner, isResponse } from "@/lib/api";
import { processWhatsAppJobQueue } from "@/lib/services/whatsapp/jobQueue";

/** Staff-authenticated queue processor (replaces calling cron route from the browser). */
export async function POST(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  try {
    const bookingIdParam = req.nextUrl.searchParams.get("bookingId");
    const bookingId = bookingIdParam ? parseInt(bookingIdParam, 10) : undefined;
    const summary = await processWhatsAppJobQueue(20, {
      bookingId: bookingId && !Number.isNaN(bookingId) ? bookingId : undefined,
    });
    return jsonOk({ ok: true, ...summary });
  } catch (e) {
    console.error("[whatsapp/jobs/process]", e);
    return jsonError(e instanceof Error ? e.message : "Queue processing failed", 500);
  }
}
