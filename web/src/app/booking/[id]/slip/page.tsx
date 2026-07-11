import type { Metadata } from "next";
import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { ensureBookingQrToken, bookingQrDataUrl } from "@/lib/bookingQr";
import BookingSlip from "@/components/BookingSlip";
import SlipActionsClient from "./SlipActionsClient";
import { buildBookingSlipData, SLIP_BIZ } from "@/lib/slipBookingData";
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
  const bookingId = parseInt(id, 10);
  if (!bookingId) return { title: "Booking Slip" };
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { monthlySerial: true, customerName: true },
  });
  if (!booking) return { title: "Booking Slip" };
  return {
    title: `Booking Slip — #${String(booking.monthlySerial).padStart(2, "0")} · ${booking.customerName}`,
  };
}

export default async function BookingSlipPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ print?: string; pdfSecret?: string; offerPdf?: string }>;
}) {
  const { id } = await params;
  const { print, pdfSecret, offerPdf } = await searchParams;
  const bookingId = parseInt(id, 10);
  if (!bookingId) notFound();

  await requireSlipPageAccess(pdfSecret);
  const pdfRender = isValidPdfRenderSecret(pdfSecret);

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      bookingItems: {
        include: {
          item: {
            select: {
              color: true,
              photo: true,
            },
          },
        },
      },
      orders: { where: { status: "active" }, orderBy: { id: "asc" } },
    },
  });
  if (!booking) notFound();

  const qrToken = booking.qrToken ?? (await ensureBookingQrToken(bookingId));
  const qrDataUrl = await bookingQrDataUrl(qrToken, undefined, 200);
  const { booking: slipBooking, items: slipItems, orders: slipOrders } = buildBookingSlipData(booking);

  return (
    <>
      {pdfRender && <SlipPdfPrintStyles />}
      {!pdfRender && (
        <SlipActionsClient
          bookingId={bookingId}
          autoPrint={print === "1"}
          offerPdfDownload={offerPdf === "1" || print === "1"}
        />
      )}
      <div className="slip-page-wrap">
        <BookingSlip
          booking={slipBooking}
          items={slipItems}
          orders={slipOrders}
          qrDataUrl={qrDataUrl}
          businessName={SLIP_BIZ.name}
          businessPhone={SLIP_BIZ.phone}
          businessAddress={SLIP_BIZ.address}
          businessTagline={SLIP_BIZ.tagline}
          printMode={pdfRender}
        />      </div>
    </>
  );
}
