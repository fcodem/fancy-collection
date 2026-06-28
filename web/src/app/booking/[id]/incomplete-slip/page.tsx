import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { ensureBookingQrToken, bookingQrDataUrl } from "@/lib/bookingQr";
import IncompleteReturnSlip from "@/components/IncompleteReturnSlip";
import IncompleteSlipActions from "./IncompleteSlipActions";
import { isIncompleteSlipEligible } from "@/lib/bookingStatus";
import { buildIncompleteSlipData, SLIP_BIZ } from "@/lib/slipBookingData";
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
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
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

  if (!isIncompleteSlipEligible(booking)) {
    redirect(`/booking/${bookingId}`);
  }

  const qrToken = await ensureBookingQrToken(bookingId);
  const qrDataUrl = await bookingQrDataUrl(qrToken, undefined, 280);
  const { booking: slipBooking, incompleteItems, returnedItems } = buildIncompleteSlipData(booking);

  return (
    <>
      <IncompleteSlipActions bookingId={bookingId} />
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
