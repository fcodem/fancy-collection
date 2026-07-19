/**
 * Premium slip template contract — one HTML/Chromium source of truth per slip kind.
 * Embedded markers in React slip components are validated before WhatsApp upload.
 */

export const PREMIUM_SLIP_TEMPLATE_VERSION = "premium-slip-v1";

/** Error code for failed premium render — job stays retryable; no jsPDF substitute. */
export const PREMIUM_SLIP_RENDER_FAILED = "PREMIUM_SLIP_RENDER_FAILED";

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

const REQUIRED_LABELS: Record<PremiumSlipKind, string[]> = {
  booking: ["BOOKING SLIP", "Customer Details", "Delivery Date", "Return Date"],
  delivery: ["DELIVERED", "Please Return All Items By", "Delivery Payment Summary"],
  return: ["RETURN RECEIPT", "Thank You For Returning With Care"],
  incomplete: ["INCOMPLETE RETURN", "Security Held"],
};

/** Reject jsPDF fallbacks and corrupt/empty PDFs before customer send. */
export function assertPremiumSlipPdf(pdf: Buffer, kind: PremiumSlipKind): void {
  if (!pdf?.length || pdf[0] !== 0x25 || pdf[1] !== 0x50) {
    throw new PremiumSlipValidationError(kind, "Invalid PDF header");
  }
  if (pdf.length < MIN_PREMIUM_PDF_BYTES) {
    throw new PremiumSlipValidationError(
      kind,
      `PDF too small (${pdf.length} bytes) — likely simplified fallback`,
    );
  }

  const haystack = pdf.toString("latin1");
  const marker = premiumSlipMarker(kind);
  if (!haystack.includes(marker)) {
    throw new PremiumSlipValidationError(kind, `Missing premium marker ${marker}`);
  }

  for (const label of REQUIRED_LABELS[kind]) {
    if (!haystack.includes(label)) {
      throw new PremiumSlipValidationError(kind, `Missing required label: ${label}`);
    }
  }

  // jsPDF operation fallback signatures (must never reach customers)
  if (haystack.includes("Thank you for choosing Fancy Collection.") && !haystack.includes(marker)) {
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

/** Props for invisible marker element inside each slip component. */
export function premiumSlipMarkerProps(kind: PremiumSlipKind) {
  return {
    "data-premium-slip": premiumSlipMarker(kind),
    "data-slip-kind": kind,
    "data-template-version": PREMIUM_SLIP_TEMPLATE_VERSION,
  } as const;
}
