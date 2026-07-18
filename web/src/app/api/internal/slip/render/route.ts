import { NextRequest, NextResponse } from "next/server";
import { isValidPdfRenderSecret } from "@/lib/slipPdfAccess";
import { renderSlipPdfDirect } from "@/lib/services/whatsapp/slipHtmlPdfDirect.server";
import type {
  SlipPdfKind,
  SlipPdfRenderOptions,
} from "@/lib/services/whatsapp/slipHtmlPdf.server";

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
  if (!isValidPdfRenderSecret(req.headers.get("x-pdf-secret"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    kind?: unknown;
    bookingId?: unknown;
    origin?: unknown;
    opts?: unknown;
  };
  try {
    body = await req.json();
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

  try {
    const pdf = await renderSlipPdfDirect(kind, bookingId, origin, opts);
    const body = new Uint8Array(pdf);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-length": String(body.byteLength),
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    console.error("[slip-render]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Slip render failed" }, { status: 500 });
  }
}
