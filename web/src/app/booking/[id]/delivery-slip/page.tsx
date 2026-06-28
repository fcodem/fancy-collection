import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { ensureBookingQrToken, bookingQrDataUrl } from "@/lib/bookingQr";
import DeliverySlip from "@/components/DeliverySlip";
import DeliverySlipActions from "./DeliverySlipActions";
import { isDeliverySlipEligible, resolveDeliverySlipItemId } from "@/lib/bookingStatus";
import { buildDeliverySlipData, SLIP_BIZ } from "@/lib/slipBookingData";
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
  if (!booking) return { title: "Delivery Slip" };
  return {
    title: `Delivery Slip — #${String(booking.monthlySerial).padStart(2, "0")} · ${booking.customerName}`,
  };
}

export default async function DeliverySlipPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ item?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const { item: itemParam } = await searchParams;
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

  if (!isDeliverySlipEligible(booking)) {
    redirect(`/booking/${bookingId}/slip`);
  }

  const slipItemId = resolveDeliverySlipItemId(booking, itemParam);
  if (slipItemId === "pick") {
    redirect(`/booking-delivery/${bookingId}`);
  }

  let slipData;
  try {
    slipData = buildDeliverySlipData(booking, {
      bookingItemId: slipItemId,
    });
  } catch {
    redirect(`/booking-delivery/${bookingId}`);
  }

  const { booking: slipBooking, items, slipSubtitle } = slipData;

  const qrToken = await ensureBookingQrToken(bookingId);
  const qrDataUrl = await bookingQrDataUrl(qrToken, undefined, 280);

  return (
    <>
      <DeliverySlipActions bookingId={bookingId} />
      <div className="slip-page-wrap">
        <DeliverySlip
          booking={slipBooking}
          items={items}
          qrDataUrl={qrDataUrl}
          businessName={SLIP_BIZ.name}
          businessPhone={SLIP_BIZ.phone}
          businessAddress={SLIP_BIZ.address}
          slipSubtitle={slipSubtitle}
        />
      </div>
    </>
  );
}
