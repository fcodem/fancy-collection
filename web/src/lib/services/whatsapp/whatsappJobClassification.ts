import prisma from "@/lib/prisma";
import type { WhatsAppJob } from "@prisma/client";
import {
  canSafelyRequeueRenderFailure,
  isPremiumSlipRenderFailureMessage,
  isProviderOutcomeUnknownReason,
  isWhatsAppRenderFailureReason,
  providerOutcomeForFailure,
  type ProviderOutcome,
  type SendLedgerFence,
} from "./whatsappProviderOutcome";

export type WhatsAppJobFailureBucket =
  | "SAFE_RENDER_RETRY"
  | "WITHHELD_META_CONFIRMED"
  | "WITHHELD_PROVIDER_UNKNOWN"
  | "WITHHELD_ALREADY_SAFE_RETRIED"
  | "WITHHELD_NOT_RENDER_FAILURE"
  | "WITHHELD_NOT_FAILED";

export type ClassifiedWhatsAppJobFailure = {
  jobId: number;
  jobType: string;
  bookingId: number | null;
  status: string;
  attempts: number;
  maxAttempts: number;
  idempotencyKey: string | null;
  failedReason: string | null;
  bucket: WhatsAppJobFailureBucket;
  safeToRequeue: boolean;
  withholdReason: string | null;
  metaCalled: boolean;
  metaMessageId: string | null;
  providerOutcome: ProviderOutcome | null;
  sendStartedAt: string | null;
  sendConfirmedAt: string | null;
  failureBeforeProvider: boolean;
  staleSendStartedAt: boolean;
  errorCategory: "render" | "infrastructure" | "provider_unknown" | "other" | null;
  safeRenderRetryCount: number;
};

function payloadOf(job: WhatsAppJob): Record<string, unknown> {
  return (job.payload ?? {}) as Record<string, unknown>;
}

function errorCategory(reason: string | null): ClassifiedWhatsAppJobFailure["errorCategory"] {
  if (!reason) return null;
  if (isPremiumSlipRenderFailureMessage(reason)) return "render";
  if (/\bETXTBSY\b|\bEBUSY\b|\bENOSPC\b/i.test(reason)) return "infrastructure";
  if (isProviderOutcomeUnknownReason(reason)) return "provider_unknown";
  return "other";
}

export function classifyWhatsAppJobFailure(
  job: Pick<
    WhatsAppJob,
    | "id"
    | "jobType"
    | "bookingId"
    | "status"
    | "attempts"
    | "maxAttempts"
    | "idempotencyKey"
    | "failedReason"
    | "payload"
  >,
  ledger: SendLedgerFence | null | undefined,
): ClassifiedWhatsAppJobFailure {
  const payload = payloadOf(job as WhatsAppJob);
  const failedReason = job.failedReason;
  const metaMessageId =
    (typeof payload.metaMessageId === "string" && payload.metaMessageId.trim()) ||
    (typeof ledger?.providerMessageId === "string" && ledger.providerMessageId.trim()) ||
    null;
  const providerOutcome =
    (typeof payload.providerOutcome === "string"
      ? (payload.providerOutcome as ProviderOutcome)
      : null) ??
    (failedReason ? providerOutcomeForFailure(failedReason, ledger) : null);
  const sendStartedAt = ledger?.sendStartedAt?.toISOString() ?? null;
  const sendConfirmedAt = ledger?.sendConfirmedAt?.toISOString() ?? null;
  const renderFailure = isWhatsAppRenderFailureReason(failedReason);
  const failureBeforeProvider =
    renderFailure ||
    providerOutcome === "NOT_ATTEMPTED" ||
    (!metaMessageId && !sendConfirmedAt && !isProviderOutcomeUnknownReason(failedReason));
  const metaCalled = Boolean(
    metaMessageId || sendConfirmedAt || (ledger?.sendStartedAt && !renderFailure),
  );
  const staleSendStartedAt = Boolean(
    ledger?.sendStartedAt && !ledger?.sendConfirmedAt && renderFailure,
  );
  const safeRenderRetryCount =
    typeof payload.safeRenderRetryCount === "number" ? payload.safeRenderRetryCount : 0;

  let bucket: WhatsAppJobFailureBucket = "WITHHELD_NOT_RENDER_FAILURE";
  let safeToRequeue = false;
  let withholdReason: string | null = null;

  if (job.status !== "failed") {
    bucket = "WITHHELD_NOT_FAILED";
    withholdReason = "Job is not in failed status.";
  } else if (metaMessageId || sendConfirmedAt) {
    bucket = "WITHHELD_META_CONFIRMED";
    withholdReason = "Confirmed Meta message ID or provider confirmation exists.";
  } else if (isProviderOutcomeUnknownReason(failedReason)) {
    bucket = "WITHHELD_PROVIDER_UNKNOWN";
    withholdReason = "Provider outcome unknown — document may already have been delivered.";
  } else if (safeRenderRetryCount >= 1 && renderFailure) {
    bucket = "WITHHELD_ALREADY_SAFE_RETRIED";
    withholdReason = "Already received one safe render retry.";
  } else {
    const gate = canSafelyRequeueRenderFailure({
      status: job.status,
      failedReason,
      payload: job.payload,
      ledger,
    });
    if (gate.ok) {
      bucket = "SAFE_RENDER_RETRY";
      safeToRequeue = true;
    } else {
      bucket = renderFailure ? "WITHHELD_ALREADY_SAFE_RETRIED" : "WITHHELD_NOT_RENDER_FAILURE";
      withholdReason = gate.reason;
    }
  }

  return {
    jobId: job.id,
    jobType: job.jobType,
    bookingId: job.bookingId,
    status: job.status,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    idempotencyKey: job.idempotencyKey,
    failedReason,
    bucket,
    safeToRequeue,
    withholdReason,
    metaCalled,
    metaMessageId,
    providerOutcome,
    sendStartedAt,
    sendConfirmedAt,
    failureBeforeProvider,
    staleSendStartedAt,
    errorCategory: errorCategory(failedReason),
    safeRenderRetryCount,
  };
}

const RENDER_FAILURE_WHERE = {
  status: "failed" as const,
  OR: [
    { failedReason: { contains: "PREMIUM_SLIP_RENDER_FAILED", mode: "insensitive" as const } },
    { failedReason: { contains: "PREMIUM_SLIP_VALIDATION_FAILED", mode: "insensitive" as const } },
    { failedReason: { contains: "PREMIUM_SLIP_HTML_VALIDATION_FAILED", mode: "insensitive" as const } },
    { failedReason: { contains: "ETXTBSY", mode: "insensitive" as const } },
    { failedReason: { contains: "EBUSY", mode: "insensitive" as const } },
    { failedReason: { contains: "ENOSPC", mode: "insensitive" as const } },
  ],
};

export async function listClassifiedWhatsAppRenderFailures(limit = 500) {
  const jobs = await prisma.whatsAppJob.findMany({
    where: RENDER_FAILURE_WHERE,
    orderBy: [{ createdAt: "desc" }],
    take: limit,
  });

  const keys = jobs
    .map((job) => job.idempotencyKey)
    .filter((key): key is string => Boolean(key));
  const ledgers = keys.length
    ? await prisma.whatsAppSendLedger.findMany({
        where: { idempotencyKey: { in: keys } },
      })
    : [];
  const ledgerByKey = new Map(ledgers.map((row) => [row.idempotencyKey, row]));

  return jobs.map((job) =>
    classifyWhatsAppJobFailure(job, ledgerByKey.get(job.idempotencyKey ?? "") ?? null),
  );
}

export type SafeRenderRetrySummary = {
  dryRun: boolean;
  scanned: number;
  requeued: ClassifiedWhatsAppJobFailure[];
  withheld: ClassifiedWhatsAppJobFailure[];
};

export async function summarizeSafeRenderRetries(): Promise<{
  classified: ClassifiedWhatsAppJobFailure[];
  safe: ClassifiedWhatsAppJobFailure[];
  withheld: ClassifiedWhatsAppJobFailure[];
}> {
  const classified = await listClassifiedWhatsAppRenderFailures();
  const safe = classified.filter((row) => row.safeToRequeue);
  const withheld = classified.filter((row) => !row.safeToRequeue);
  return { classified, safe, withheld };
}

export async function getWhatsAppRenderFailureReport(limit = 500) {
  const classified = await listClassifiedWhatsAppRenderFailures(limit);
  return {
    total: classified.length,
    safeToRequeue: classified.filter((row) => row.safeToRequeue),
    withheld: classified.filter((row) => !row.safeToRequeue),
    byBucket: classified.reduce<Record<string, number>>((acc, row) => {
      acc[row.bucket] = (acc[row.bucket] ?? 0) + 1;
      return acc;
    }, {}),
    jobs: classified,
  };
}
