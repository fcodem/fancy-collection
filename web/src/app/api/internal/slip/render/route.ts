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
  measureTmpFreeBytes,
} from "@/lib/slipTempCleanup";
import {
  errorCodeFromUnknown,
  PREMIUM_SLIP_RENDER_FAILED,
  isPremiumRenderFailureRetryable,
  isSlipRenderTimeoutError,
  PREMIUM_SLIP_RENDER_TIMEOUT,
} from "@/lib/services/whatsapp/slipRenderErrors";
import { logSlipRenderDiagnostic } from "@/lib/services/whatsapp/slipRenderDiagnostics";
import {
  PREMIUM_SLIP_HEADER_KIND,
  PREMIUM_SLIP_HEADER_VALIDATED,
  PREMIUM_SLIP_HEADER_VERSION,
  PREMIUM_SLIP_TEMPLATE_VERSION,
} from "@/lib/premiumSlip";

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
  const freeTmpBefore = await measureTmpFreeBytes();
  await ensureSlipTempHeadroom();

  try {
    const rendered = await renderSlipPdfDirect(kind, bookingId, origin, opts);
    const tmpBytesAfter = measureSlipTempUsage();
    const freeTmpAfter = await measureTmpFreeBytes();
    logSlipRenderDiagnostic({
      kind,
      bookingId,
      attempt: 1,
      freeTmpBefore,
      freeTmpAfter,
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
    const freeTmpAfter = await measureTmpFreeBytes();
    if (isSlipRenderTimeoutError(e)) {
      logSlipRenderDiagnostic({
        kind,
        bookingId,
        attempt: 1,
        freeTmpBefore,
        freeTmpAfter,
        tmpBytesBefore,
        tmpBytesAfter,
        durationMs: Date.now() - started,
        ok: false,
        errorCode: PREMIUM_SLIP_RENDER_TIMEOUT,
      });
      return NextResponse.json(
        {
          error: "Slip render timed out",
          code: PREMIUM_SLIP_RENDER_TIMEOUT,
          retryable: true,
          stage: e.stage,
        },
        { status: 503 },
      );
    }
    const errorCode = errorCodeFromUnknown(e) ?? PREMIUM_SLIP_RENDER_FAILED;
    const message = e instanceof Error ? e.message : "Slip render failed";
    console.error("[slip/render] Render failed:", { kind, bookingId, errorCode, message });
    logSlipRenderDiagnostic({
      kind,
      bookingId,
      attempt: 1,
      freeTmpBefore,
      freeTmpAfter,
      tmpBytesBefore,
      tmpBytesAfter,
      durationMs: Date.now() - started,
      ok: false,
      errorCode,
    });

    // Transient render errors are retryable (503); browser/library launch failures are not.
    const retryable = isPremiumRenderFailureRetryable(e);
    return NextResponse.json(
      {
        error: message,
        code: PREMIUM_SLIP_RENDER_FAILED,
        retryable,
        errorCode,
      },
      { status: retryable ? 503 : 500 },
    );
  }
}
