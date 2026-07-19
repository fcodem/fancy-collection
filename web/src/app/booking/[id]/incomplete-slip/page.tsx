import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { ensureBookingQrToken, bookingQrDataUrl } from "@/lib/bookingQr";
import IncompleteReturnSlip from "@/components/IncompleteReturnSlip";
import IncompleteSlipActions from "./IncompleteSlipActions";
import { isIncompleteSlipEligible } from "@/lib/bookingStatus";
import { buildIncompleteSlipData, SLIP_BIZ } from "@/lib/slipBookingData";
import { parseBookingItemIdsParam } from "@/lib/slipDelta";
import { requireSlipPageAccess } from "@/lib/requireSlipPageAccess";
import { isValidPdfRenderSecret } from "@/lib/slipPdfAccess";
import { SlipPdfPrintStyles } from "@/components/SlipPdfPrintStyles";
import "@/styles/slip-print.css";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const booking = await prisma.booking.findUnique({
    where: { id: parseInt(id, 10) },
    select: { monthlySerial: true, customerName: true },
  });
  if (!booking) return { title: "Incomplete Return Slip" };
  return {
    title: `Incomplete Return — #${String(booking.monthlySerial).padStart(2, "0")} · ${booking.customerName}`,
  };
}

export default async function IncompleteSlipPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pdfSecret?: string; items?: string }>;
}) {
  const { id } = await params;
  const { pdfSecret, items: itemsParam } = await searchParams;
  const bookingId = parseInt(id, 10);

  await requireSlipPageAccess(pdfSecret);
  const pdfRender = isValidPdfRenderSecret(pdfSecret);

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      bookingItems: {
        include: { item: { select: { color: true, photo: true, originalPhoto: true, sku: true } } },
      },
    },
  });
  if (!booking) notFound();

  if (!isIncompleteSlipEligible(booking)) {
    redirect(`/booking/${bookingId}`);
  }

  const qrToken = await ensureBookingQrToken(bookingId);
  const qrDataUrl = await bookingQrDataUrl(qrToken, undefined, 280);
  const bookingItemIds = parseBookingItemIdsParam(itemsParam);
  const { booking: slipBooking, incompleteItems, returnedItems } = buildIncompleteSlipData(
    booking,
    bookingItemIds ? { bookingItemIds } : undefined,
  );

  return (
    <>
      {pdfRender && <SlipPdfPrintStyles />}
      {!pdfRender && <IncompleteSlipActions bookingId={bookingId} />}
      <div className="slip-page-wrap">
        <IncompleteReturnSlip
          booking={slipBooking}
          incompleteItems={incompleteItems}
          returnedItems={returnedItems}
          qrDataUrl={qrDataUrl}
          businessName={SLIP_BIZ.name}
          businessPhone={SLIP_BIZ.phone}
          businessAddress={SLIP_BIZ.address}
        />
      </div>
    </>
  );
}
