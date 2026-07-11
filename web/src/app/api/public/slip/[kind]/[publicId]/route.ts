import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import prisma from "@/lib/prisma";
import {
  generateDeliverySlipPdf,
  generateReturnSlipPdf,
  generateIncompleteSlipPdf,
  generateBookingSlipPdf,
} from "@/lib/services/whatsapp/slipHtmlPdf.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS = new Set(["delivery", "return", "incomplete", "booking"]);

/**
 * Public slip PDF for WhatsApp URL-button templates (no login).
 * kind: delivery | return | incomplete | booking
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ kind: string; publicId: string }> },
) {
  const { kind: rawKind, publicId: rawId } = await params;
  const kind = (rawKind || "").trim().toLowerCase();
  const publicId = decodeURIComponent(rawId || "").trim();

  if (!KINDS.has(kind)) {
    return NextResponse.json({ error: "Invalid slip kind" }, { status: 400 });
  }
  if (!publicId || publicId.length > 64 || !/^[\w.-]+$/.test(publicId)) {
    return NextResponse.json({ error: "Invalid slip id" }, { status: 400 });
  }

  const booking = await prisma.booking.findFirst({
    where: { publicBookingId: publicId },
    select: { id: true },
  });
  if (!booking) {
    return NextResponse.json({ error: "Slip not found" }, { status: 404 });
  }

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
      ? [`${publicId}.pdf`]
      : [
          kind === "delivery"
            ? `DeliverySlip_${publicId}.pdf`
            : kind === "return"
              ? `ReturnSlip_${publicId}.pdf`
              : `IncompleteReturn_${publicId}.pdf`,
          kind === "delivery"
            ? `DeliverySlip_${publicId}_partial.pdf`
            : kind === "return"
              ? `ReturnSlip_${publicId}_partial.pdf`
              : `IncompleteReturn_${publicId}_partial.pdf`,
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
      "Cache-Control": "private, max-age=300",
    },
  });
}
