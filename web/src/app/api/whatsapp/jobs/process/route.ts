import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { jsonError, jsonOk, requireOwner, isResponse } from "@/lib/api";
import {
  clearWhatsAppBudgetDeferralReasons,
  processWhatsAppJobQueue,
} from "@/lib/services/whatsapp/jobQueue";
import {
  HEAVY_WHATSAPP_JOB_TYPES,
  LIGHT_WHATSAPP_JOB_TYPES,
  WHATSAPP_CRON_SAFE_BUDGET_MS,
} from "@/lib/services/whatsapp/whatsappRuntime";

export const maxDuration = 60;

const ALL_SLIP_JOB_TYPES = [
  ...HEAVY_WHATSAPP_JOB_TYPES,
  ...LIGHT_WHATSAPP_JOB_TYPES,
];

/** Staff-authenticated queue processor (replaces calling cron route from the browser). */
export async function POST(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  try {
    const bookingIdParam = req.nextUrl.searchParams.get("bookingId");
    const bookingId = bookingIdParam ? parseInt(bookingIdParam, 10) : undefined;
    const drainAllSlips =
      req.nextUrl.searchParams.get("drainAllSlips") === "1" ||
      req.nextUrl.searchParams.get("drainAllSlips") === "true" ||
      req.nextUrl.searchParams.get("drainBookingSlips") === "1" ||
      req.nextUrl.searchParams.get("drainBookingSlips") === "true";

    const cleared = await clearWhatsAppBudgetDeferralReasons().catch(() => 0);

    const summary = await processWhatsAppJobQueue({
      // One heavy PDF slip per invocation under Vercel 60s; light notices can share the batch.
      maxJobs: drainAllSlips ? 2 : 3,
      maxHeavyJobs: 1,
      runtimeBudgetMs: WHATSAPP_CRON_SAFE_BUDGET_MS,
      bookingId: bookingId && !Number.isNaN(bookingId) ? bookingId : undefined,
      ...(drainAllSlips ? { jobTypes: ALL_SLIP_JOB_TYPES } : {}),
    });

    const pendingSlips = await prisma.whatsAppJob.count({
      where: {
        status: "pending",
        jobType: { in: ALL_SLIP_JOB_TYPES },
        scheduledAt: { lte: new Date() },
      },
    });

    const pendingByType = await prisma.whatsAppJob.groupBy({
      by: ["jobType"],
      where: {
        status: "pending",
        jobType: { in: ALL_SLIP_JOB_TYPES },
        scheduledAt: { lte: new Date() },
      },
      _count: { _all: true },
    });

    return jsonOk({
      ok: true,
      ...summary,
      cleared_budget_deferrals: cleared,
      pending_slips: pendingSlips,
      pending_booking_slips: pendingByType.find((r) => r.jobType === "booking_bill")?._count._all ?? 0,
      pending_by_type: Object.fromEntries(
        pendingByType.map((r) => [r.jobType, r._count._all]),
      ),
      drain_all_slips: drainAllSlips,
    });
  } catch (e) {
    console.error("[whatsapp/jobs/process]", e);
    return jsonError(e instanceof Error ? e.message : "Queue processing failed", 500);
  }
}
