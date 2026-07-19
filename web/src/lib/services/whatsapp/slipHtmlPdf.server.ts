import "server-only";

import { getPdfRenderSecret } from "@/lib/slipPdfAccess";
import { buildSlipRenderAuthHeaders } from "@/lib/slipRenderAuth";

export type SlipPdfKind = "booking" | "delivery" | "return" | "incomplete";

export type SlipPdfRenderOptions = {
  scope?: "full" | "single" | "combined";
  bookingItemId?: number;
  bookingItemIds?: number[];
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

/**
 * Centralized Chromium architecture:
 *   Every caller delegates to the ONE Chromium-enabled function,
 *   POST /api/internal/slip/render, instead of importing the Puppeteer/Chromium
 *   pool. This keeps @sparticuz/chromium out of ~13 hot API bundles (smaller
 *   uploads, faster cold starts) while still producing the full HTML slip
 *   inline. If the renderer is unreachable/misconfigured, callers throw and the
 *   upstream callers decide retry/fallback policy (delivery slips never use jsPDF).
 */
async function renderSlipViaEndpoint(
  kind: SlipPdfKind,
  bookingId: number,
  requestOrigin?: string,
  opts?: SlipPdfRenderOptions,
): Promise<Buffer> {
  const secret = getPdfRenderSecret();
  if (!secret) {
    throw new Error("PDF_RENDER_SECRET or CRON_SECRET must be set for slip PDF generation.");
  }

  const origin = resolveAppOrigin(requestOrigin);
  const rawBody = JSON.stringify({ kind, bookingId, origin, opts: opts ?? null });
  const res = await fetch(`${origin}/api/internal/slip/render`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...buildSlipRenderAuthHeaders(rawBody),
    },
    body: rawBody,
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    let message = `Slip renderer failed (HTTP ${res.status})`;
    if (detail) {
      try {
        const parsed = JSON.parse(detail) as {
          error?: string;
          code?: string;
          errorCode?: string;
        };
        if (parsed.error) message = parsed.error;
        if (parsed.code || parsed.errorCode) {
          message = `${parsed.code || parsed.errorCode}: ${message}`;
        }
      } catch {
        message += `: ${detail.slice(0, 200)}`;
      }
    }
    throw new Error(message);
  }

  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

export async function generateBookingSlipPdf(
  bookingId: number,
  requestOrigin?: string,
): Promise<Buffer> {
  return renderSlipViaEndpoint("booking", bookingId, requestOrigin);
}

export async function generateDeliverySlipPdf(
  bookingId: number,
  requestOrigin?: string,
  opts?: SlipPdfRenderOptions,
): Promise<Buffer> {
  return renderSlipViaEndpoint("delivery", bookingId, requestOrigin, opts);
}

export async function generateReturnSlipPdf(
  bookingId: number,
  requestOrigin?: string,
  opts?: SlipPdfRenderOptions,
): Promise<Buffer> {
  return renderSlipViaEndpoint("return", bookingId, requestOrigin, opts);
}

export async function generateIncompleteSlipPdf(
  bookingId: number,
  requestOrigin?: string,
  opts?: SlipPdfRenderOptions,
): Promise<Buffer> {
  return renderSlipViaEndpoint("incomplete", bookingId, requestOrigin, opts);
}
