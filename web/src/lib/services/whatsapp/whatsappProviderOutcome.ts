export type ProviderOutcome = "NOT_ATTEMPTED" | "ACCEPTED" | "UNKNOWN";

export const PROVIDER_OUTCOME_UNKNOWN_PREFIX = "PROVIDER_OUTCOME_UNKNOWN:";

/** True when premium slip rendering/validation failed before any Meta API call. */
export function isPremiumSlipRenderFailureMessage(error: string): boolean {
  return /PREMIUM_SLIP_RENDER_FAILED|PREMIUM_SLIP_HTML_VALIDATION_FAILED|PREMIUM_SLIP_VALIDATION_FAILED/i.test(
    error,
  );
}

/** Render or Chromium temp failures safe to retry when Meta never confirmed. */
export function isWhatsAppRenderFailureReason(reason: string | null | undefined): boolean {
  if (!reason) return false;
  if (isPremiumSlipRenderFailureMessage(reason)) return true;
  return /\bETXTBSY\b|\bEBUSY\b|\bENOSPC\b/i.test(reason);
}

export function isProviderOutcomeUnknownReason(reason: string | null | undefined): boolean {
  return Boolean(reason?.startsWith(PROVIDER_OUTCOME_UNKNOWN_PREFIX));
}

export type SendLedgerFence = {
  sendStartedAt?: Date | null;
  sendConfirmedAt?: Date | null;
  providerMessageId?: string | null;
};

/** Meta was dispatched but confirmation was lost — not a pre-send render failure. */
export function shouldTreatAsProviderOutcomeUnknown(
  error: string,
  ledger: SendLedgerFence | null | undefined,
): boolean {
  if (isPremiumSlipRenderFailureMessage(error)) return false;
  return Boolean(ledger?.sendStartedAt && !ledger?.sendConfirmedAt);
}

export function providerOutcomeForFailure(
  error: string,
  ledger: SendLedgerFence | null | undefined,
): ProviderOutcome {
  if (isPremiumSlipRenderFailureMessage(error)) return "NOT_ATTEMPTED";
  if (shouldTreatAsProviderOutcomeUnknown(error, ledger)) return "UNKNOWN";
  return "NOT_ATTEMPTED";
}

export function formatJobFailedReason(
  error: string,
  ledger: SendLedgerFence | null | undefined,
): string {
  if (shouldTreatAsProviderOutcomeUnknown(error, ledger)) {
    return `${PROVIDER_OUTCOME_UNKNOWN_PREFIX} ${error}`.slice(0, 500);
  }
  return error.slice(0, 500);
}

export function canSafelyRetryWhatsAppJob(input: {
  status: string;
  failedReason: string | null;
  payload: unknown;
  allowSafeRenderRetry?: boolean;
}): { ok: true } | { ok: false; reason: string } {
  const payload = (input.payload ?? {}) as Record<string, unknown>;
  if (typeof payload.metaMessageId === "string" && payload.metaMessageId.trim()) {
    return { ok: false, reason: "Job already has a confirmed Meta message ID — will not resend." };
  }
  if (isProviderOutcomeUnknownReason(input.failedReason)) {
    return {
      ok: false,
      reason:
        "Provider outcome unknown — reconcile using stored provider request/message information before resending.",
    };
  }
  const safeRenderRetryCount =
    typeof payload.safeRenderRetryCount === "number" ? payload.safeRenderRetryCount : 0;
  if (
    input.allowSafeRenderRetry &&
    isWhatsAppRenderFailureReason(input.failedReason) &&
    safeRenderRetryCount >= 1
  ) {
    return {
      ok: false,
      reason: "This job already received one safe render retry.",
    };
  }
  if (input.status !== "failed" && input.status !== "processing") {
    return { ok: false, reason: "Only failed or stuck jobs can be retried." };
  }
  return { ok: true };
}

export function canSafelyRequeueRenderFailure(input: {
  status: string;
  failedReason: string | null;
  payload: unknown;
  ledger: SendLedgerFence | null | undefined;
}): { ok: true } | { ok: false; reason: string } {
  const payload = (input.payload ?? {}) as Record<string, unknown>;
  const metaMessageId =
    (typeof payload.metaMessageId === "string" && payload.metaMessageId.trim()) ||
    (typeof input.ledger?.providerMessageId === "string" && input.ledger.providerMessageId.trim());
  if (metaMessageId) {
    return { ok: false, reason: "Confirmed Meta message ID exists — will not resend." };
  }
  if (input.ledger?.sendConfirmedAt) {
    return { ok: false, reason: "Provider send was confirmed — will not resend." };
  }
  if (isProviderOutcomeUnknownReason(input.failedReason)) {
    return {
      ok: false,
      reason: "Provider outcome unknown — document may already have been delivered.",
    };
  }
  if (!isWhatsAppRenderFailureReason(input.failedReason)) {
    return { ok: false, reason: "Failure is not a render/infrastructure error." };
  }
  const safeRenderRetryCount =
    typeof payload.safeRenderRetryCount === "number" ? payload.safeRenderRetryCount : 0;
  if (safeRenderRetryCount >= 1) {
    return { ok: false, reason: "Already received one safe render retry." };
  }
  if (input.status !== "failed") {
    return { ok: false, reason: "Only failed jobs are eligible for safe render retry." };
  }
  return { ok: true };
}
