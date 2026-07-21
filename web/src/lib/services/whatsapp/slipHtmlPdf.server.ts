import "server-only";

import { getPdfRenderSecret } from "@/lib/slipPdfAccess";
import { buildSlipRenderAuthHeaders } from "@/lib/slipRenderAuth";
import {
  assertPremiumSlipPdf,
  assertPremiumSlipRenderHeaders,
} from "@/lib/premiumSlip";
import { PremiumSlipRenderError } from "./slipRenderErrors";
import {
  linkAbortSignal,
  WHATSAPP_RENDERER_REQUEST_TIMEOUT_MS,
} from "./whatsappRuntime";

export type SlipPdfKind = "booking" | "delivery" | "return" | "incomplete" | "postponement";

export type SlipPdfRenderOptions = {
  scope?: "full" | "single" | "combined";
  bookingItemId?: number;
  bookingItemIds?: number[];
};

export type SlipRenderFetchOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
};

export function resolveAppOrigin(requestOrigin?: string): string {
  const vercelOrigin = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`
    : undefined;

  const raw =
    requestOrigin?.replace(/\/$/, "") ||
    process.env.BASE_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    vercelOrigin ||
    "http://127.0.0.1:3000";
  return raw.replace("://localhost", "://127.0.0.1");
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
    case "postponement":
      return `/postponed-booking/${bookingId}/print`;
  }
}

/**
 * Build the (secret-signed) slip page URL Chromium will render.
 * Kept here (no Chromium import) so both the public generators and the single
 * internal renderer share one definition.
 */
export function buildSlipPageUrl(
  kind: SlipPdfKind,
  bookingId: number,
  requestOrigin?: string,
  opts?: SlipPdfRenderOptions,
): string {
  const secret = getPdfRenderSecret();
  if (!secret) {
    throw new PremiumSlipRenderError(
      "PDF_RENDER_SECRET or CRON_SECRET must be set for slip PDF generation.",
      "SECRET_MISSING",
    );
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

/**
 * Centralized Chromium architecture:
 *   Every caller delegates to the ONE Chromium-enabled function,
 *   POST /api/internal/slip/render, instead of importing the Puppeteer/Chromium
 *   pool. This keeps @sparticuz/chromium out of ~13 hot API bundles (smaller
 *   uploads, faster cold starts) while still producing the full HTML slip
 *   inline. If the renderer is unreachable/misconfigured, callers throw and the
 *   upstream callers decide retry/fallback policy (delivery slips never use jsPDF).
 */
export async function renderSlipViaEndpoint(
  kind: SlipPdfKind,
  bookingId: number,
  requestOrigin?: string,
  opts?: SlipPdfRenderOptions,
  fetchOpts?: SlipRenderFetchOptions,
): Promise<Buffer> {
  const secret = getPdfRenderSecret();
  if (!secret) {
    throw new PremiumSlipRenderError(
      "PDF_RENDER_SECRET or CRON_SECRET must be set for slip PDF generation.",
      "SECRET_MISSING",
    );
  }

  const origin = resolveAppOrigin(requestOrigin);
  const rawBody = JSON.stringify({ kind, bookingId, origin, opts: opts ?? null });
  const timeoutMs = fetchOpts?.timeoutMs ?? WHATSAPP_RENDERER_REQUEST_TIMEOUT_MS;
  const controller = new AbortController();
  const unlink = linkAbortSignal(controller, fetchOpts?.signal);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${origin}/api/internal/slip/render`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...buildSlipRenderAuthHeaders(rawBody),
      },
      body: rawBody,
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (fetchErr) {
    clearTimeout(timeout);
    unlink();
    const msg = fetchErr instanceof Error ? fetchErr.message : "Slip render fetch failed";
    const aborted =
      fetchErr instanceof Error &&
      (fetchErr.name === "AbortError" || controller.signal.aborted);
    throw new PremiumSlipRenderError(
      aborted
        ? "Premium slip rendering timed out — Meta was not contacted."
        : `Slip render endpoint unreachable: ${msg}`,
      aborted ? "TIMEOUT" : "FETCH_FAILED",
      aborted,
    );
  }
  clearTimeout(timeout);
  unlink();

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    let message = `Slip renderer failed (HTTP ${res.status})`;
    let errorCode: string | undefined;
    let retryable = res.status === 503;
    if (detail) {
      try {
        const parsed = JSON.parse(detail) as {
          error?: string;
          code?: string;
          errorCode?: string;
          retryable?: boolean;
        };
        if (parsed.error) message = parsed.error;
        errorCode = parsed.errorCode || parsed.code || undefined;
        if (parsed.retryable === false) retryable = false;
        if (errorCode) {
          message = `${errorCode}: ${message}`;
        }
      } catch {
        message += `: ${detail.slice(0, 200)}`;
      }
    }
    console.error("[slipHtmlPdf] Render endpoint returned error:", { status: res.status, message, errorCode, kind, bookingId });
    throw new PremiumSlipRenderError(message, errorCode, retryable);
  }

  if (kind !== "postponement") {
    assertPremiumSlipRenderHeaders(res.headers, kind);
  }

  const ab = await res.arrayBuffer();
  const pdf = Buffer.from(ab);
  if (kind === "postponement") {
    assertBasicSlipPdf(pdf);
    return pdf;
  }
  assertPremiumSlipPdf(pdf, kind);
  return pdf;
}

function assertBasicSlipPdf(pdf: Buffer): void {
  if (!pdf?.length || pdf[0] !== 0x25 || pdf[1] !== 0x50) {
    throw new PremiumSlipRenderError("Invalid PDF header", "INVALID_PDF");
  }
  if (pdf.length < 2_000) {
    throw new PremiumSlipRenderError(
      `PDF too small (${pdf.length} bytes)`,
      "INVALID_PDF",
    );
  }
}

export async function generateBookingSlipPdf(
  bookingId: number,
  requestOrigin?: string,
  fetchOpts?: SlipRenderFetchOptions,
): Promise<Buffer> {
  return renderSlipViaEndpoint("booking", bookingId, requestOrigin, undefined, fetchOpts);
}

export async function generateDeliverySlipPdf(
  bookingId: number,
  requestOrigin?: string,
  opts?: SlipPdfRenderOptions,
  fetchOpts?: SlipRenderFetchOptions,
): Promise<Buffer> {
  return renderSlipViaEndpoint("delivery", bookingId, requestOrigin, opts, fetchOpts);
}

export async function generateReturnSlipPdf(
  bookingId: number,
  requestOrigin?: string,
  opts?: SlipPdfRenderOptions,
  fetchOpts?: SlipRenderFetchOptions,
): Promise<Buffer> {
  return renderSlipViaEndpoint("return", bookingId, requestOrigin, opts, fetchOpts);
}

export async function generateIncompleteSlipPdf(
  bookingId: number,
  requestOrigin?: string,
  opts?: SlipPdfRenderOptions,
  fetchOpts?: SlipRenderFetchOptions,
): Promise<Buffer> {
  return renderSlipViaEndpoint("incomplete", bookingId, requestOrigin, opts, fetchOpts);
}

export async function generatePostponementSlipPdf(
  bookingId: number,
  requestOrigin?: string,
  fetchOpts?: SlipRenderFetchOptions,
): Promise<Buffer> {
  return renderSlipViaEndpoint("postponement", bookingId, requestOrigin, undefined, fetchOpts);
}
