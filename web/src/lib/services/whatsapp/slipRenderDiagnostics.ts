import type { SlipPdfKind } from "./slipHtmlPdf.server";

export type SlipRenderDiagnostic = {
  kind: SlipPdfKind;
  bookingId: number;
  attempt: number;
  freeTmpBefore: number | null;
  freeTmpAfter: number | null;
  /** @deprecated use freeTmpBefore */
  tmpBytesBefore?: number;
  /** @deprecated use freeTmpAfter */
  tmpBytesAfter?: number;
  durationMs: number;
  ok: boolean;
  errorCode?: string;
  executableReused?: boolean;
  extractionMs?: number;
  browserLaunchMs?: number;
  pageLoadMs?: number;
  pdfMs?: number;
};

/** Safe diagnostics — no customer PII. */
export function logSlipRenderDiagnostic(d: SlipRenderDiagnostic): void {
  const payload = {
    event: "slip_render",
    kind: d.kind,
    bookingId: d.bookingId,
    attempt: d.attempt,
    freeTmpBefore: d.freeTmpBefore ?? d.tmpBytesBefore ?? null,
    freeTmpAfter: d.freeTmpAfter ?? d.tmpBytesAfter ?? null,
    durationMs: d.durationMs,
    ok: d.ok,
    ...(d.executableReused != null ? { executableReused: d.executableReused } : {}),
    ...(d.extractionMs != null ? { extractionMs: d.extractionMs } : {}),
    ...(d.browserLaunchMs != null ? { browserLaunchMs: d.browserLaunchMs } : {}),
    ...(d.pageLoadMs != null ? { pageLoadMs: d.pageLoadMs } : {}),
    ...(d.pdfMs != null ? { pdfMs: d.pdfMs } : {}),
    ...(d.errorCode ? { errorCode: d.errorCode } : {}),
  };
  if (d.ok) {
    console.info("[slip-render]", JSON.stringify(payload));
  } else {
    console.warn("[slip-render]", JSON.stringify(payload));
  }
}
