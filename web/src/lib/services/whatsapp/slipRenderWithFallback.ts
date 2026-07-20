import "server-only";

import type { PremiumSlipKind } from "@/lib/premiumSlip";
import {
  classifyPremiumRenderFailure,
  PREMIUM_SLIP_RENDER_FAILED,
} from "./slipRenderErrors";

export type SlipPdfRenderer = "premium" | "jspdf_fallback";

export type SlipRenderWithFallbackResult = {
  pdf: Buffer;
  renderer: SlipPdfRenderer;
  premiumError?: string;
  premiumFailureCategory?: string;
};

export type SlipRenderWithFallbackOpts = {
  kind: PremiumSlipKind;
  bookingId: number;
  jobId?: number;
  executablePath?: string;
  premium: () => Promise<Buffer>;
  fallback: () => Promise<Buffer>;
};

/** Structured slip renderer logs — no customer PII. */
export function logSlipRendererEvent(
  payload: Record<string, string | number | boolean | null | undefined>,
): void {
  const line = JSON.stringify({ event: "slip_renderer", ...payload });
  if (payload.ok === false) {
    console.warn("[slip-renderer]", line);
  } else {
    console.info("[slip-renderer]", line);
  }
}

/**
 * Try premium Chromium HTML→PDF first; on failure generate jsPDF fallback and continue.
 * Premium failure is preserved in logs for admin visibility.
 */
export async function renderSlipWithFallback(
  opts: SlipRenderWithFallbackOpts,
): Promise<SlipRenderWithFallbackResult> {
  logSlipRendererEvent({
    ok: true,
    stage: "premium_start",
    slipKind: opts.kind,
    bookingId: opts.bookingId,
    jobId: opts.jobId ?? null,
    renderer: "premium",
    executablePath: opts.executablePath ?? null,
  });

  try {
    const pdf = await opts.premium();
    logSlipRendererEvent({
      ok: true,
      stage: "premium_ok",
      slipKind: opts.kind,
      bookingId: opts.bookingId,
      jobId: opts.jobId ?? null,
      renderer: "premium",
    });
    return { pdf, renderer: "premium" };
  } catch (premiumErr) {
    const premiumError =
      premiumErr instanceof Error ? premiumErr.message : String(premiumErr);
    const premiumFailureCategory = classifyPremiumRenderFailure(premiumErr);

    logSlipRendererEvent({
      ok: false,
      stage: "premium_failed",
      slipKind: opts.kind,
      bookingId: opts.bookingId,
      jobId: opts.jobId ?? null,
      renderer: "premium",
      premiumFailureCategory,
      errorCode: PREMIUM_SLIP_RENDER_FAILED,
      executablePath: opts.executablePath ?? null,
    });

    try {
      const pdf = await opts.fallback();
      logSlipRendererEvent({
        ok: true,
        stage: "fallback_ok",
        slipKind: opts.kind,
        bookingId: opts.bookingId,
        jobId: opts.jobId ?? null,
        renderer: "jspdf_fallback",
        premiumFailureCategory,
        errorCode: PREMIUM_SLIP_RENDER_FAILED,
      });
      return {
        pdf,
        renderer: "jspdf_fallback",
        premiumError,
        premiumFailureCategory,
      };
    } catch (fallbackErr) {
      const fallbackError =
        fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
      logSlipRendererEvent({
        ok: false,
        stage: "fallback_failed",
        slipKind: opts.kind,
        bookingId: opts.bookingId,
        jobId: opts.jobId ?? null,
        renderer: "jspdf_fallback",
        premiumFailureCategory,
        errorCode: PREMIUM_SLIP_RENDER_FAILED,
      });
      throw new Error(
        `${PREMIUM_SLIP_RENDER_FAILED}: premium failed (${premiumFailureCategory}); fallback failed: ${fallbackError}`,
      );
    }
  }
}
