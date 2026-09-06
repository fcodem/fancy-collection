import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { jsonError, jsonOk, requireOwner, isResponse } from "@/lib/api";
import {
  clearWhatsAppBudgetDeferralReasons,
  processWhatsAppJobQueue,
} from "@/lib/services/whatsapp/jobQueue";
import { WHATSAPP_CRON_SAFE_BUDGET_MS } from "@/lib/services/whatsapp/whatsappRuntime";

export const maxDuration = 60;

/** Staff-authenticated queue processor (replaces calling cron route from the browser). */
export async function POST(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  try {
    const bookingIdParam = req.nextUrl.searchParams.get("bookingId");
    const bookingId = bookingIdParam ? parseInt(bookingIdParam, 10) : undefined;
    const drainBookingSlips =
      req.nextUrl.searchParams.get("drainBookingSlips") === "1" ||
      req.nextUrl.searchParams.get("drainBookingSlips") === "true";

    const cleared = await clearWhatsAppBudgetDeferralReasons().catch(() => 0);

    const summary = await processWhatsAppJobQueue({
      // One heavy slip per invocation — safe under Vercel 60s with the widened budget.
      maxJobs: drainBookingSlips ? 1 : 3,
      maxHeavyJobs: 1,
      runtimeBudgetMs: WHATSAPP_CRON_SAFE_BUDGET_MS,
      bookingId: bookingId && !Number.isNaN(bookingId) ? bookingId : undefined,
      ...(drainBookingSlips ? { jobTypes: ["booking_bill"] } : {}),
    });

    const pendingBookingSlips = await prisma.whatsAppJob.count({
      where: {
        status: "pending",
        jobType: "booking_bill",
        scheduledAt: { lte: new Date() },
      },
    });

    return jsonOk({
      ok: true,
      ...summary,
      cleared_budget_deferrals: cleared,
      pending_booking_slips: pendingBookingSlips,
      drain_booking_slips: drainBookingSlips,
    });
  } catch (e) {
    console.error("[whatsapp/jobs/process]", e);
    return jsonError(e instanceof Error ? e.message : "Queue processing failed", 500);
  }
}
