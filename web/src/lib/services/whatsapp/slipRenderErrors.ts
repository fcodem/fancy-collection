export const PREMIUM_SLIP_RENDER_FAILED = "PREMIUM_SLIP_RENDER_FAILED";
export const PREMIUM_SLIP_RENDER_TIMEOUT = "PREMIUM_SLIP_RENDER_TIMEOUT";

export type SlipRenderTimeoutStage =
  | "chromiumPrep"
  | "browserLaunch"
  | "navigation"
  | "domValidation"
  | "pdfGeneration";

export class SlipRenderTimeoutError extends Error {
  readonly code = PREMIUM_SLIP_RENDER_TIMEOUT;
  readonly retryable = true;

  constructor(readonly stage: SlipRenderTimeoutStage) {
    super(`Slip render timed out at ${stage}`);
    this.name = "SlipRenderTimeoutError";
  }
}

export function isSlipRenderTimeoutError(err: unknown): err is SlipRenderTimeoutError {
  return err instanceof SlipRenderTimeoutError;
}

export type PremiumRenderFailureCategory =
  | "SHARED_LIBRARY"
  | "BROWSER_LAUNCH"
  | "CHROME_NOT_FOUND"
  | "TRANSIENT"
  | "UNKNOWN";

import {
  errorCodeFromUnknown,
  isBrowserLaunchFailure,
  isChromiumSharedLibraryError,
  isEnospcError,
  isNonRetryablePremiumRenderError,
} from "@/lib/slipTempCleanup";

export {
  errorCodeFromUnknown,
  isBrowserLaunchFailure,
  isChromiumSharedLibraryError,
  isEnospcError,
  isNonRetryablePremiumRenderError,
};

/** Browser-pool / renderer failure — retryability depends on failure category. */
export class PremiumSlipRenderError extends Error {
  readonly code = PREMIUM_SLIP_RENDER_FAILED;
  readonly retryable: boolean;

  constructor(
    message: string,
    readonly errorCode?: string,
    retryable?: boolean,
  ) {
    super(message);
    this.name = "PremiumSlipRenderError";
    this.retryable =
      retryable ??
      !isNonRetryablePremiumRenderError({ message, errorCode: this.errorCode });
  }
}

export function classifyPremiumRenderFailure(err: unknown): PremiumRenderFailureCategory {
  if (isChromiumSharedLibraryError(err)) return "SHARED_LIBRARY";
  if (isBrowserLaunchFailure(err)) return "BROWSER_LAUNCH";
  const code = errorCodeFromUnknown(err);
  if (code === "CHROME_NOT_FOUND") return "CHROME_NOT_FOUND";
  const msg = err instanceof Error ? err.message : String(err);
  if (/timeout|timed?\s*out|net::|ECONNREFUSED|Protocol error|Target closed/i.test(msg)) {
    return "TRANSIENT";
  }
  return "UNKNOWN";
}

export function isPremiumRenderFailureRetryable(err: unknown): boolean {
  if (err instanceof PremiumSlipRenderError) return err.retryable;
  if (typeof err === "string") {
    return !isNonRetryablePremiumRenderError(err);
  }
  return !isNonRetryablePremiumRenderError(err);
}

export function isPremiumSlipRenderError(err: unknown): err is PremiumSlipRenderError {
  return err instanceof PremiumSlipRenderError;
}

/** @deprecated alias — use PremiumSlipRenderError */
export const SlipRenderPoolError = PremiumSlipRenderError;
