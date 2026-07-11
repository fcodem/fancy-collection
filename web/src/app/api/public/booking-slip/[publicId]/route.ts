import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import prisma from "@/lib/prisma";
import { generateBookingSlipPdf } from "@/lib/services/whatsapp/slipHtmlPdf.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public booking-slip PDF download (no login).
 * Used by the WhatsApp UTILITY template URL button so bills can be delivered
 * outside the 24-hour chat window without the customer messaging first.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ publicId: string }> },
) {
  const { publicId: raw } = await params;
  const publicId = decodeURIComponent(raw || "").trim();
  if (!publicId || publicId.length > 64 || !/^[\w.-]+$/.test(publicId)) {
    return NextResponse.json({ error: "Invalid slip id" }, { status: 400 });
  }

  const booking = await prisma.booking.findFirst({
    where: { publicBookingId: publicId },
    select: { id: true, publicBookingId: true, customerName: true },
  });
  if (!booking) {
    return NextResponse.json({ error: "Slip not found" }, { status: 404 });
  }

  const filename = `${publicId}.pdf`;
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
      "Cache-Control": "private, max-age=300",
    },
  });
}
