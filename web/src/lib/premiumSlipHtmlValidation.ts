import {
  PREMIUM_SLIP_TEMPLATE_VERSION,
  premiumSlipMarker,
  type PremiumSlipKind,
} from "@/lib/premiumSlip";

export const PREMIUM_SLIP_HTML_VALIDATION_FAILED = "PREMIUM_SLIP_HTML_VALIDATION_FAILED";

export const PREMIUM_SLIP_ROOT_ID: Record<PremiumSlipKind, string> = {
  booking: "booking-slip-root",
  delivery: "delivery-slip-root",
  return: "return-slip-root",
  incomplete: "incomplete-slip-root",
};

/** Required DOM sections per slip kind (data-slip-section values). */
export const PREMIUM_SLIP_REQUIRED_SECTIONS: Record<PremiumSlipKind, readonly string[]> = {
  booking: [
    "customer-details",
    "delivery-date",
    "return-date",
    "items",
    "payment-summary",
    "qr",
    "terms",
  ],
  delivery: ["delivery-date", "return-date", "items", "payment-summary"],
  return: ["items", "terms"],
  incomplete: ["items", "payment-summary"],
};

export type PremiumSlipDomSnapshot = {
  rootPresent: boolean;
  marker: {
    premiumSlip: string | null;
    slipKind: string | null;
    templateVersion: string | null;
  } | null;
  sections: string[];
};

export class PremiumSlipHtmlValidationError extends Error {
  readonly code = PREMIUM_SLIP_HTML_VALIDATION_FAILED;

  constructor(
    readonly kind: PremiumSlipKind,
    detail: string,
  ) {
    super(`${PREMIUM_SLIP_HTML_VALIDATION_FAILED}: Premium slip HTML validation failed (${kind}): ${detail}`);
    this.name = "PremiumSlipHtmlValidationError";
  }
}

export function collectPremiumSlipDomSnapshot(rootId: string): PremiumSlipDomSnapshot {
  const root = document.getElementById(rootId);
  const markerEl = document.querySelector("[data-premium-slip]");
  const sectionEls = document.querySelectorAll("[data-slip-section]");
  const sections = [...sectionEls]
    .map((el) => el.getAttribute("data-slip-section"))
    .filter((value): value is string => Boolean(value));

  return {
    rootPresent: Boolean(root),
    marker: markerEl
      ? {
          premiumSlip: markerEl.getAttribute("data-premium-slip"),
          slipKind: markerEl.getAttribute("data-slip-kind"),
          templateVersion: markerEl.getAttribute("data-template-version"),
        }
      : null,
    sections,
  };
}

export function validatePremiumSlipDomSnapshot(
  kind: PremiumSlipKind,
  snapshot: PremiumSlipDomSnapshot,
): void {
  const rootId = PREMIUM_SLIP_ROOT_ID[kind];
  if (!snapshot.rootPresent) {
    throw new PremiumSlipHtmlValidationError(kind, `Missing slip root #${rootId}`);
  }

  if (!snapshot.marker) {
    throw new PremiumSlipHtmlValidationError(kind, "Missing [data-premium-slip] marker element");
  }

  const expectedMarker = premiumSlipMarker(kind);
  if (snapshot.marker.premiumSlip !== expectedMarker) {
    throw new PremiumSlipHtmlValidationError(
      kind,
      `Invalid data-premium-slip (expected ${expectedMarker}, got ${snapshot.marker.premiumSlip ?? "null"})`,
    );
  }
  if (snapshot.marker.slipKind !== kind) {
    throw new PremiumSlipHtmlValidationError(
      kind,
      `Invalid data-slip-kind (expected ${kind}, got ${snapshot.marker.slipKind ?? "null"})`,
    );
  }
  if (snapshot.marker.templateVersion !== PREMIUM_SLIP_TEMPLATE_VERSION) {
    throw new PremiumSlipHtmlValidationError(
      kind,
      `Invalid data-template-version (expected ${PREMIUM_SLIP_TEMPLATE_VERSION}, got ${snapshot.marker.templateVersion ?? "null"})`,
    );
  }

  const required = PREMIUM_SLIP_REQUIRED_SECTIONS[kind];
  for (const section of required) {
    if (!snapshot.sections.includes(section)) {
      throw new PremiumSlipHtmlValidationError(kind, `Missing required section [data-slip-section="${section}"]`);
    }
  }
}

/** Browser-side validation executed inside Chromium before print-to-PDF. */
export function validatePremiumSlipDomInBrowser(kind: PremiumSlipKind): void {
  const rootId = PREMIUM_SLIP_ROOT_ID[kind];
  const snapshot = collectPremiumSlipDomSnapshot(rootId);
  validatePremiumSlipDomSnapshot(kind, snapshot);
}
