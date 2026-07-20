import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { mergeSendMetaIntoPayload } from "./jobSendMeta";
import {
  isProviderOutcomeUnknownReason,
} from "./whatsappProviderOutcome";
import { retryWhatsAppJob } from "./jobQueue";

export type ReconcileAction = "mark_delivered" | "mark_not_delivered" | "cancel";

export function canReconcileProviderUnknownJob(input: {
  status: string;
  failedReason: string | null;
  payload: unknown;
}): { ok: true } | { ok: false; reason: string } {
  const payload = (input.payload ?? {}) as Record<string, unknown>;
  if (typeof payload.metaMessageId === "string" && payload.metaMessageId.trim()) {
    return { ok: false, reason: "Job already has a confirmed Meta message ID." };
  }
  if (payload.sendStage === "PROVIDER_CONFIRMED") {
    return { ok: false, reason: "Job is already marked as provider confirmed." };
  }
  if (
    !isProviderOutcomeUnknownReason(input.failedReason) &&
    payload.sendStage !== "PROVIDER_OUTCOME_UNKNOWN"
  ) {
    return {
      ok: false,
      reason: "Only provider-outcome-unknown jobs require reconciliation.",
    };
  }
  if (input.status !== "failed") {
    return { ok: false, reason: "Only failed jobs can be reconciled." };
  }
  return { ok: true };
}

export async function reconcileWhatsAppProviderUnknownJob(
  jobId: number,
  ownerId: number,
  action: ReconcileAction,
) {
  const job = await prisma.whatsAppJob.findUnique({ where: { id: jobId } });
  if (!job) throw new Error("Job not found");

  const eligibility = canReconcileProviderUnknownJob({
    status: job.status,
    failedReason: job.failedReason,
    payload: job.payload,
  });
  if (!eligibility.ok) throw new Error(eligibility.reason);

  const now = new Date().toISOString();
  const payload = (job.payload ?? {}) as Record<string, unknown>;
  const idempotencyVersion =
    typeof payload.idempotencyVersion === "number" ? payload.idempotencyVersion : 0;

  if (action === "cancel") {
    return prisma.whatsAppJob.update({
      where: { id: jobId },
      data: {
        status: "cancelled",
        failedReason: null,
        payload: mergeSendMetaIntoPayload(job.payload, {
          sendStage: "NOT_ATTEMPTED",
          reconciledBy: ownerId,
          reconciledAt: now,
        }) as Prisma.InputJsonValue,
      },
    });
  }

  if (action === "mark_delivered") {
    return prisma.whatsAppJob.update({
      where: { id: jobId },
      data: {
        status: "done",
        completedAt: new Date(),
        failedReason: null,
        payload: mergeSendMetaIntoPayload(job.payload, {
          sendStage: "PROVIDER_CONFIRMED",
          reconciledBy: ownerId,
          reconciledAt: now,
        }) as Prisma.InputJsonValue,
      },
    });
  }

  // mark_not_delivered — force resend with new idempotency version
  const nextVersion = idempotencyVersion + 1;
  const baseKey =
    typeof payload.idempotencyKey === "string"
      ? payload.idempotencyKey.replace(/:v\d+$/, "")
      : `whatsapp-job:${jobId}`;
  const nextKey = `${baseKey}:v${nextVersion}`;

  await prisma.whatsAppJob.update({
    where: { id: jobId },
    data: {
      failedReason: null,
      payload: mergeSendMetaIntoPayload(job.payload, {
        idempotencyKey: nextKey,
        idempotencyVersion: nextVersion,
        sendStage: "NOT_ATTEMPTED",
        forceResendApprovedBy: ownerId,
        forceResendApprovedAt: now,
        reconciledBy: ownerId,
        reconciledAt: now,
      }) as Prisma.InputJsonValue,
    },
  });

  return retryWhatsAppJob(jobId, { resetAttempts: true });
}
