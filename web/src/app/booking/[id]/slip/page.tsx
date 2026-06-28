import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { ensureBookingQrToken, bookingQrDataUrl } from "@/lib/bookingQr";
import BookingSlip from "@/components/BookingSlip";
import SlipActions from "./SlipActions";
import { buildBookingSlipData, SLIP_BIZ } from "@/lib/slipBookingData";
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
  searchParams: Promise<{ print?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const { print } = await searchParams;
  const bookingId = parseInt(id, 10);

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      bookingItems: {
        include: { item: { select: { color: true } } },
      },
    },
  });
  if (!booking) notFound();

  const qrToken = await ensureBookingQrToken(bookingId);
  const qrDataUrl = await bookingQrDataUrl(qrToken, undefined, 280);
  const { booking: slipBooking, items: slipItems } = buildBookingSlipData(booking);

  return (
    <>
      <SlipActions bookingId={bookingId} autoPrint={print === "1"} />
      <div className="slip-page-wrap">
        <BookingSlip
          booking={slipBooking}
          items={slipItems}
          qrDataUrl={qrDataUrl}
          businessName={SLIP_BIZ.name}
          businessPhone={SLIP_BIZ.phone}
          businessAddress={SLIP_BIZ.address}
          businessTagline={SLIP_BIZ.tagline}
        />
      </div>
    </>
  );
}
