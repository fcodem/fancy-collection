/**
 * Premium slip template contract — one HTML/Chromium source of truth per slip kind.
 * HTML DOM is validated before PDF generation; PDF checks are binary-only.
 */

export const PREMIUM_SLIP_TEMPLATE_VERSION = "premium-slip-v1";

/** Error code for failed premium render — job stays retryable; no jsPDF substitute. */
export const PREMIUM_SLIP_RENDER_FAILED = "PREMIUM_SLIP_RENDER_FAILED";

export const PREMIUM_SLIP_HEADER_VALIDATED = "x-premium-slip-validated";
export const PREMIUM_SLIP_HEADER_KIND = "x-premium-slip-kind";
export const PREMIUM_SLIP_HEADER_VERSION = "x-premium-slip-version";

export type PremiumSlipKind = "booking" | "delivery" | "return" | "incomplete";

export type PremiumSlipRenderMeta = {
  slipKind: PremiumSlipKind;
  templateVersion: string;
  bookingId: number;
  scope?: string;
  itemIds?: number[];
  renderStatus: "ok" | "failed";
};

/** Hidden marker rendered into every premium slip HTML/PDF. */
export function premiumSlipMarker(kind: PremiumSlipKind): string {
  return `PREMIUM_SLIP:${PREMIUM_SLIP_TEMPLATE_VERSION}:${kind}`;
}

const MIN_PREMIUM_PDF_BYTES = 8_000;

/** Known jsPDF operation fallback is typically well under 12KB. */
const MAX_JSPDF_FALLBACK_BYTES = 12_000;

function pdfLatin1(pdf: Buffer): string {
  return pdf.toString("latin1");
}

function pdfPageCount(pdf: Buffer): number {
  const body = pdfLatin1(pdf);
  const pageMatches = body.match(/\/Type\s*\/Page\b/g);
  return pageMatches?.length ?? 0;
}

function looksLikeJsPdfFallback(pdf: Buffer): boolean {
  if (pdf.length >= MAX_JSPDF_FALLBACK_BYTES) return false;
  const body = pdfLatin1(pdf);
  return body.includes("jsPDF") || body.includes("Thank you for choosing Fancy Collection.");
}

/** Reject corrupt/empty PDFs and known jsPDF fallbacks — no compressed-text marker search. */
export function assertPremiumSlipPdf(pdf: Buffer, kind: PremiumSlipKind): void {
  void kind;
  if (!pdf?.length || pdf[0] !== 0x25 || pdf[1] !== 0x50) {
    throw new PremiumSlipValidationError(kind, "Invalid PDF header");
  }
  if (pdf.length < MIN_PREMIUM_PDF_BYTES) {
    throw new PremiumSlipValidationError(
      kind,
      `PDF too small (${pdf.length} bytes) — likely simplified fallback`,
    );
  }
  if (pdfPageCount(pdf) < 1) {
    throw new PremiumSlipValidationError(kind, "PDF has zero pages");
  }
  if (looksLikeJsPdfFallback(pdf)) {
    throw new PremiumSlipValidationError(kind, "Detected jsPDF operation fallback");
  }
}

export class PremiumSlipValidationError extends Error {
  readonly code = "PREMIUM_SLIP_VALIDATION_FAILED";

  constructor(
    readonly kind: PremiumSlipKind,
    detail: string,
  ) {
    super(`Premium slip validation failed (${kind}): ${detail}`);
    this.name = "PremiumSlipValidationError";
  }
}

export function assertPremiumSlipRenderHeaders(
  headers: Headers | { get(name: string): string | null },
  expectedKind: PremiumSlipKind,
): void {
  const validated = headers.get(PREMIUM_SLIP_HEADER_VALIDATED);
  const kind = headers.get(PREMIUM_SLIP_HEADER_KIND);
  const version = headers.get(PREMIUM_SLIP_HEADER_VERSION);

  if (validated !== "1") {
    throw new PremiumSlipValidationError(
      expectedKind,
      "Internal renderer did not confirm HTML validation (missing X-Premium-Slip-Validated)",
    );
  }
  if (kind !== expectedKind) {
    throw new PremiumSlipValidationError(
      expectedKind,
      `Renderer kind mismatch (expected ${expectedKind}, got ${kind ?? "null"})`,
    );
  }
  if (version !== PREMIUM_SLIP_TEMPLATE_VERSION) {
    throw new PremiumSlipValidationError(
      expectedKind,
      `Renderer version mismatch (expected ${PREMIUM_SLIP_TEMPLATE_VERSION}, got ${version ?? "null"})`,
    );
  }
}

export function buildPremiumSlipRenderMeta(
  kind: PremiumSlipKind,
  bookingId: number,
  opts?: { scope?: string; itemIds?: number[]; renderStatus?: "ok" | "failed" },
): PremiumSlipRenderMeta {
  return {
    slipKind: kind,
    templateVersion: PREMIUM_SLIP_TEMPLATE_VERSION,
    bookingId,
    scope: opts?.scope,
    itemIds: opts?.itemIds,
    renderStatus: opts?.renderStatus ?? "ok",
  };
}

/** Props for marker element inside each slip component. */
export function premiumSlipMarkerProps(kind: PremiumSlipKind) {
  return {
    "data-premium-slip": premiumSlipMarker(kind),
    "data-slip-kind": kind,
    "data-template-version": PREMIUM_SLIP_TEMPLATE_VERSION,
  } as const;
}

export { PREMIUM_SLIP_HTML_VALIDATION_FAILED } from "@/lib/premiumSlipHtmlValidation";
