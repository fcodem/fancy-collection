import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { isResponse, jsonError, requireUser } from "@/lib/api";
import { generateBookingSlipPdf } from "@/lib/services/whatsapp/slipHtmlPdf.server";
import {
  bookingSlipPdfFilename,
  resolvePublicBookingId,
} from "@/lib/services/whatsapp/publicBookingId";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (isResponse(user)) return user;

  const { id } = await params;
  const bookingId = parseInt(id, 10);
  if (!bookingId) return jsonError("Invalid booking ID", 400);

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { id: true, publicBookingId: true },
  });
  if (!booking) return jsonError("Booking not found", 404);

  try {
    const origin = req.nextUrl.origin;
    const pdfBuffer = await generateBookingSlipPdf(bookingId, origin);
    const publicId = resolvePublicBookingId(booking);
    const filename = bookingSlipPdfFilename(publicId);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "PDF generation failed";
    console.error("[booking-slip-pdf]", bookingId, err);
    return jsonError(message, 500);
  }
}
