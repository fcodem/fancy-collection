import type { SlipPdfKind } from "./slipHtmlPdf.server";

export type SlipRenderDiagnostic = {
  kind: SlipPdfKind;
  bookingId: number;
  attempt: number;
  tmpBytesBefore: number;
  tmpBytesAfter: number;
  durationMs: number;
  ok: boolean;
  errorCode?: string;
};

/** Safe diagnostics — no customer PII. */
export function logSlipRenderDiagnostic(d: SlipRenderDiagnostic): void {
  const payload = {
    event: "slip_render",
    kind: d.kind,
    bookingId: d.bookingId,
    attempt: d.attempt,
    tmpBytesBefore: d.tmpBytesBefore,
    tmpBytesAfter: d.tmpBytesAfter,
    durationMs: d.durationMs,
    ok: d.ok,
    ...(d.errorCode ? { errorCode: d.errorCode } : {}),
  };
  if (d.ok) {
    console.info("[slip-render]", JSON.stringify(payload));
  } else {
    console.warn("[slip-render]", JSON.stringify(payload));
  }
}
