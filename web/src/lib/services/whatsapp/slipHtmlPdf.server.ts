import "server-only";

import { getPdfRenderSecret } from "@/lib/slipPdfAccess";
import { renderHtmlUrlToPdf } from "./pdfBrowserPool";

export type SlipPdfKind = "booking" | "delivery" | "return" | "incomplete";

export type SlipPdfRenderOptions = {
  scope?: "full" | "single" | "combined";
  bookingItemId?: number;
  bookingItemIds?: number[];
};

export function resolveAppOrigin(requestOrigin?: string): string {
  const raw =
    requestOrigin?.replace(/\/$/, "") ||
    process.env.BASE_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "http://127.0.0.1:3000";
  return raw.replace("://localhost", "://127.0.0.1");
}

const SLIP_HTML_MARKERS = [
  "slip-page-wrap",
  "slip-container",
  "booking-slip-root",
  "delivery-slip-root",
  "return-slip-root",
  "incomplete-slip-root",
];

const SLIP_ROOT_SELECTOR =
  "#booking-slip-root, #delivery-slip-root, #return-slip-root, #incomplete-slip-root, .slip-page-wrap";

function assertSlipHtml(html: string): void {
  if (SLIP_HTML_MARKERS.some((m) => html.includes(m))) return;
  if (html.includes('href="/login"') || /sign in/i.test(html)) {
    throw new Error(
      "Slip page was blocked by login. Set PDF_RENDER_SECRET or CRON_SECRET in .env.local and restart the dev server.",
    );
  }
  throw new Error("Slip page did not render — check booking id and slip eligibility");
}

function slipPath(kind: SlipPdfKind, bookingId: number): string {
  switch (kind) {
    case "booking":
      return `/booking/${bookingId}/slip`;
    case "delivery":
      return `/booking/${bookingId}/delivery-slip`;
    case "return":
      return `/booking/${bookingId}/return-slip`;
    case "incomplete":
      return `/booking/${bookingId}/incomplete-slip`;
  }
}

export function buildSlipPageUrl(
  kind: SlipPdfKind,
  bookingId: number,
  requestOrigin?: string,
  opts?: SlipPdfRenderOptions,
): string {
  const secret = getPdfRenderSecret();
  if (!secret) {
    throw new Error("PDF_RENDER_SECRET or CRON_SECRET must be set for slip PDF generation.");
  }

  const params = new URLSearchParams({ pdfSecret: secret });
  if (opts?.scope) params.set("scope", opts.scope);
  if (opts?.bookingItemId != null) params.set("item", String(opts.bookingItemId));
  if (opts?.bookingItemIds?.length) {
    params.set("items", opts.bookingItemIds.join(","));
  }

  const origin = resolveAppOrigin(requestOrigin);
  return `${origin}${slipPath(kind, bookingId)}?${params.toString()}`;
}

async function renderSlipPdf(
  kind: SlipPdfKind,
  bookingId: number,
  requestOrigin?: string,
  opts?: SlipPdfRenderOptions,
): Promise<Buffer> {
  const url = buildSlipPageUrl(kind, bookingId, requestOrigin, opts);
  return renderHtmlUrlToPdf({
    url,
    rootSelector: SLIP_ROOT_SELECTOR,
    validateHtml: assertSlipHtml,
  });
}

export async function generateBookingSlipPdf(
  bookingId: number,
  requestOrigin?: string,
): Promise<Buffer> {
  return renderSlipPdf("booking", bookingId, requestOrigin);
}

export async function generateDeliverySlipPdf(
  bookingId: number,
  requestOrigin?: string,
  opts?: SlipPdfRenderOptions,
): Promise<Buffer> {
  return renderSlipPdf("delivery", bookingId, requestOrigin, opts);
}

export async function generateReturnSlipPdf(
  bookingId: number,
  requestOrigin?: string,
  opts?: SlipPdfRenderOptions,
): Promise<Buffer> {
  return renderSlipPdf("return", bookingId, requestOrigin, opts);
}

export async function generateIncompleteSlipPdf(
  bookingId: number,
  requestOrigin?: string,
  opts?: SlipPdfRenderOptions,
): Promise<Buffer> {
  return renderSlipPdf("incomplete", bookingId, requestOrigin, opts);
}
