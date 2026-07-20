import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { jsonError, jsonOk, requireOwner, isResponse } from "@/lib/api";
import { processWhatsAppJobQueue, retryWhatsAppJobSafely } from "@/lib/services/whatsapp/jobQueue";
import { isWhatsAppRenderFailureReason } from "@/lib/services/whatsapp/whatsappProviderOutcome";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  const { id } = await params;
  const jobId = parseInt(id, 10);
  if (!jobId) return jsonError("Invalid job id");

  try {
    const before = await prisma.whatsAppJob.findUnique({ where: { id: jobId } });
    if (!before) return jsonError("Job not found");

    const job = await retryWhatsAppJobSafely(jobId, user.id, {
      resetAttempts: isWhatsAppRenderFailureReason(before.failedReason),
    });
    const summary = await processWhatsAppJobQueue(5, { bookingId: job.bookingId ?? undefined });
    return jsonOk({
      ok: true,
      job: {
        id: job.id,
        status: job.status,
        scheduled_at: job.scheduledAt.toISOString(),
      },
      ...summary,
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Retry failed");
  }
}
