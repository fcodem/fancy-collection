export type ProviderOutcome = "NOT_ATTEMPTED" | "ACCEPTED" | "UNKNOWN";

export const PROVIDER_OUTCOME_UNKNOWN_PREFIX = "PROVIDER_OUTCOME_UNKNOWN:";

/** True when premium slip rendering/validation failed before any Meta API call. */
export function isPremiumSlipRenderFailureMessage(error: string): boolean {
  return /PREMIUM_SLIP_RENDER_FAILED|PREMIUM_SLIP_HTML_VALIDATION_FAILED|PREMIUM_SLIP_VALIDATION_FAILED/i.test(
    error,
  );
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
  if (input.status !== "failed" && input.status !== "processing") {
    return { ok: false, reason: "Only failed or stuck jobs can be retried." };
  }
  return { ok: true };
}
