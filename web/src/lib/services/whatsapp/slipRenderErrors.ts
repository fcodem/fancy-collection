export const PREMIUM_SLIP_RENDER_FAILED = "PREMIUM_SLIP_RENDER_FAILED";

/** Browser-pool / renderer failure — retryable, no jsPDF substitute. */
export class PremiumSlipRenderError extends Error {
  readonly code = PREMIUM_SLIP_RENDER_FAILED;
  readonly retryable = true;

  constructor(
    message: string,
    readonly errorCode?: string,
  ) {
    super(message);
    this.name = "PremiumSlipRenderError";
  }
}

export { errorCodeFromUnknown, isEnospcError } from "@/lib/slipTempCleanup";

export function isPremiumSlipRenderError(err: unknown): err is PremiumSlipRenderError {
  return err instanceof PremiumSlipRenderError;
}

/** @deprecated alias — use PremiumSlipRenderError */
export const SlipRenderPoolError = PremiumSlipRenderError;
