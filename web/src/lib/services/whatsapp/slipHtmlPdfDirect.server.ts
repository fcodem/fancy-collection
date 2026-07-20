import "server-only";

import { renderHtmlUrlToPdf } from "./pdfBrowserPool";
import {
  buildSlipPageUrl,
  type SlipPdfKind,
  type SlipPdfRenderOptions,
} from "./slipHtmlPdf.server";
import { PREMIUM_SLIP_ROOT_ID } from "@/lib/premiumSlipHtmlValidation";

/**
 * The ONLY module that imports the Puppeteer/Chromium pool. It is imported
 * exclusively by POST /api/internal/slip/render, so @sparticuz/chromium is
 * traced into that single function instead of every route that sends a slip.
 */

const SLIP_HTML_MARKERS = [
  "slip-page-wrap",
  "slip-container",
  "booking-slip-root",
  "delivery-slip-root",
  "return-slip-root",
  "incomplete-slip-root",
];

function assertSlipHtml(html: string): void {
  if (SLIP_HTML_MARKERS.some((m) => html.includes(m))) return;
  if (html.includes('href="/login"') || /sign in/i.test(html)) {
    throw new Error(
      "Slip page was blocked by login. Set PDF_RENDER_SECRET or CRON_SECRET in .env.local and restart the dev server.",
    );
  }
  throw new Error("Slip page did not render — check booking id and slip eligibility");
}

export type PremiumSlipDirectRenderResult = {
  pdf: Buffer;
  slipKind: SlipPdfKind;
  templateVersion: string;
  htmlValidated: true;
};

export async function renderSlipPdfDirect(
  kind: SlipPdfKind,
  bookingId: number,
  requestOrigin?: string,
  opts?: SlipPdfRenderOptions,
): Promise<PremiumSlipDirectRenderResult> {
  const url = buildSlipPageUrl(kind, bookingId, requestOrigin, opts);
  const rootSelector = `#${PREMIUM_SLIP_ROOT_ID[kind]}`;
  return renderHtmlUrlToPdf({
    url,
    rootSelector,
    validateHtml: assertSlipHtml,
    slipKind: kind,
  });
}
