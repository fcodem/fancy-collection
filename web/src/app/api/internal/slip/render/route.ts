import { NextRequest, NextResponse } from "next/server";
import {
  SLIP_BODYHASH_HEADER,
  SLIP_NONCE_HEADER,
  SLIP_SIG_HEADER,
  SLIP_TS_HEADER,
  verifySlipRenderAuth,
} from "@/lib/slipRenderAuth";
import { renderSlipPdfDirect } from "@/lib/services/whatsapp/slipHtmlPdfDirect.server";
import type {
  SlipPdfKind,
  SlipPdfRenderOptions,
} from "@/lib/services/whatsapp/slipHtmlPdf.server";
import {
  cleanSlipTempDirs,
  ensureSlipTempHeadroom,
  measureSlipTempUsage,
} from "@/lib/slipTempCleanup";
import {
  errorCodeFromUnknown,
  isEnospcError,
  PREMIUM_SLIP_RENDER_FAILED,
  PremiumSlipRenderError,
  isPremiumSlipRenderError,
} from "@/lib/services/whatsapp/slipRenderErrors";
import { logSlipRenderDiagnostic } from "@/lib/services/whatsapp/slipRenderDiagnostics";
import {
  PREMIUM_SLIP_HEADER_KIND,
  PREMIUM_SLIP_HEADER_VALIDATED,
  PREMIUM_SLIP_HEADER_VERSION,
  PREMIUM_SLIP_TEMPLATE_VERSION,
} from "@/lib/premiumSlip";
import { PremiumSlipHtmlValidationError } from "@/lib/premiumSlipHtmlValidation";

/**
 * The single Chromium-enabled slip renderer.
 *
 * Every other route delegates here (see slipHtmlPdf.server.ts) so
 * @sparticuz/chromium is bundled into ONE function instead of ~13. It is
 * server-to-server only, gated by the PDF render secret (never a public route).
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const KINDS = new Set<SlipPdfKind>(["booking", "delivery", "return", "incomplete"]);

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  const auth = verifySlipRenderAuth({
    ts: req.headers.get(SLIP_TS_HEADER),
    nonce: req.headers.get(SLIP_NONCE_HEADER),
    sig: req.headers.get(SLIP_SIG_HEADER),
    bodyHash: req.headers.get(SLIP_BODYHASH_HEADER),
    rawBody,
  });
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    kind?: unknown;
    bookingId?: unknown;
    origin?: unknown;
    opts?: unknown;
  };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const kind = body.kind as SlipPdfKind;
  const bookingId = Number(body.bookingId);
  if (!KINDS.has(kind) || !Number.isFinite(bookingId) || bookingId <= 0) {
    return NextResponse.json({ error: "Invalid slip request" }, { status: 400 });
  }

  const origin =
    typeof body.origin === "string" && body.origin.trim()
      ? body.origin
      : new URL(req.url).origin;
  const opts =
    body.opts && typeof body.opts === "object"
      ? (body.opts as SlipPdfRenderOptions)
      : undefined;

  const started = Date.now();
  const tmpBytesBefore = measureSlipTempUsage();
  await ensureSlipTempHeadroom();

  try {
    const rendered = await renderSlipPdfDirect(kind, bookingId, origin, opts);
    const tmpBytesAfter = measureSlipTempUsage();
    logSlipRenderDiagnostic({
      kind,
      bookingId,
      attempt: 1,
      tmpBytesBefore,
      tmpBytesAfter,
      durationMs: Date.now() - started,
      ok: true,
    });
    const bytes = new Uint8Array(rendered.pdf);
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-length": String(bytes.byteLength),
        "cache-control": "no-store",
        [PREMIUM_SLIP_HEADER_VALIDATED]: "1",
        [PREMIUM_SLIP_HEADER_KIND]: rendered.slipKind,
        [PREMIUM_SLIP_HEADER_VERSION]: PREMIUM_SLIP_TEMPLATE_VERSION,
      },
    });
  } catch (e) {
    await cleanSlipTempDirs();
    const tmpBytesAfter = measureSlipTempUsage();
    const errorCode = errorCodeFromUnknown(e) ?? PREMIUM_SLIP_RENDER_FAILED;
    logSlipRenderDiagnostic({
      kind,
      bookingId,
      attempt: 1,
      tmpBytesBefore,
      tmpBytesAfter,
      durationMs: Date.now() - started,
      ok: false,
      errorCode,
    });

    const retryable =
      isPremiumSlipRenderError(e) ||
      e instanceof PremiumSlipHtmlValidationError ||
      errorCode === "ENOSPC" ||
      errorCode === "ETXTBSY" ||
      errorCode === "EBUSY";
    const status = retryable ? 503 : 500;
    const message = e instanceof Error ? e.message : "Slip render failed";
    return NextResponse.json(
      {
        error: message,
        code: PREMIUM_SLIP_RENDER_FAILED,
        retryable,
        errorCode,
      },
      { status },
    );
  }
}
