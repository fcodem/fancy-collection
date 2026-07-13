import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import {
  generateDeliverySlipPdf,
  generateReturnSlipPdf,
  generateIncompleteSlipPdf,
  generateBookingSlipPdf,
} from "@/lib/services/whatsapp/slipHtmlPdf.server";
import { isEnumerablePublicBookingId, resolvePublicBookingId } from "@/lib/services/whatsapp/publicBookingId";
import { findBookingByPublicSlipToken } from "@/lib/services/whatsapp/publicSlipAccess";
import { consumeRateLimit } from "@/lib/publicRateLimit";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS = new Set(["delivery", "return", "incomplete", "booking"]);

/**
 * Public slip PDF — requires random publicAccessToken (not BK-######).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ kind: string; publicId: string }> },
) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limited = consumeRateLimit(`public-slip:${ip}`, { limit: 30, windowMs: 60_000 });
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } },
    );
  }

  const { kind: rawKind, publicId: rawId } = await params;
  const kind = (rawKind || "").trim().toLowerCase();
  const publicId = decodeURIComponent(rawId || "").trim();

  if (!KINDS.has(kind)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!publicId || publicId.length > 86 || !/^[\w.-]+$/.test(publicId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (isEnumerablePublicBookingId(publicId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const byToken = await findBookingByPublicSlipToken(publicId);
  if (!byToken) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const booking = await prisma.booking.findUnique({
    where: { id: byToken.id },
    select: { id: true, publicBookingId: true },
  });
  if (!booking) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const displayId = resolvePublicBookingId(booking);
  const folder =
    kind === "delivery"
      ? "delivery-slips"
      : kind === "return"
        ? "return-slips"
        : kind === "incomplete"
          ? "incomplete-slips"
          : "booking-bills";

  const candidates =
    kind === "booking"
      ? [`${displayId}.pdf`]
      : [
          kind === "delivery"
            ? `DeliverySlip_${displayId}.pdf`
            : kind === "return"
              ? `ReturnSlip_${displayId}.pdf`
              : `IncompleteReturn_${displayId}.pdf`,
          kind === "delivery"
            ? `DeliverySlip_${displayId}_partial.pdf`
            : kind === "return"
              ? `ReturnSlip_${displayId}_partial.pdf`
              : `IncompleteReturn_${displayId}_partial.pdf`,
        ];

  let pdf: Buffer | null = null;
  for (const filename of candidates) {
    try {
      pdf = await readFile(path.join(process.cwd(), "public", "uploads", folder, filename));
      break;
    } catch {
      // try next / generate
    }
  }

  if (!pdf) {
    try {
      const origin = req.nextUrl.origin;
      if (kind === "delivery") {
        pdf = await generateDeliverySlipPdf(booking.id, origin, { scope: "full" });
      } else if (kind === "return") {
        pdf = await generateReturnSlipPdf(booking.id, origin, { scope: "full" });
      } else if (kind === "incomplete") {
        pdf = await generateIncompleteSlipPdf(booking.id, origin, { scope: "combined" });
      } else {
        pdf = await generateBookingSlipPdf(booking.id, origin);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to generate slip";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  const outName = candidates[0];
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${outName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
