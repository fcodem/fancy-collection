import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { generateBookingSlipPdf } from "@/lib/services/whatsapp/slipHtmlPdf.server";
import { isEnumerablePublicBookingId, resolvePublicBookingId } from "@/lib/services/whatsapp/publicBookingId";
import { findBookingByPublicSlipToken } from "@/lib/services/whatsapp/publicSlipAccess";
import { consumeRateLimit } from "@/lib/publicRateLimit";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public booking-slip PDF (no login) — requires random publicAccessToken.
 * Enumerable BK-###### ids are rejected.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ publicId: string }> },
) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limited = consumeRateLimit(`public-slip:${ip}`, { limit: 30, windowMs: 60_000 });
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } },
    );
  }

  const { publicId: raw } = await params;
  const publicId = decodeURIComponent(raw || "").trim();
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
  const filename = `${displayId}.pdf`;
  const localPath = path.join(process.cwd(), "public", "uploads", "booking-bills", filename);

  let pdf: Buffer;
  try {
    pdf = await readFile(localPath);
  } catch {
    try {
      pdf = await generateBookingSlipPdf(booking.id, req.nextUrl.origin);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to generate slip";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
