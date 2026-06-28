import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { ensureBookingQrToken, bookingQrDataUrl } from "@/lib/bookingQr";
import ReturnSlip from "@/components/ReturnSlip";
import ReturnSlipActions from "./ReturnSlipActions";
import { isReturnSlipEligible, resolveReturnSlip } from "@/lib/bookingStatus";
import { buildReturnSlipData, SLIP_BIZ } from "@/lib/slipBookingData";
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
  if (!booking) return { title: "Return Receipt" };
  return {
    title: `Return Receipt — #${String(booking.monthlySerial).padStart(2, "0")} · ${booking.customerName}`,
  };
}

export default async function ReturnSlipPage({
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

  if (!isReturnSlipEligible(booking)) {
    redirect(`/booking/${bookingId}`);
  }

  const resolved = resolveReturnSlip(booking, itemParam);
  if (resolved === "invalid") {
    redirect(`/return/${bookingId}`);
  }

  let slipData;
  try {
    slipData = buildReturnSlipData(booking, {
      scope: resolved.scope,
      bookingItemId: resolved.scope === "single" ? resolved.bookingItemId : undefined,
    });
  } catch {
    redirect(`/return/${bookingId}`);
  }

  const { booking: slipBooking, items, slipSubtitle } = slipData;

  const qrToken = await ensureBookingQrToken(bookingId);
  const qrDataUrl = await bookingQrDataUrl(qrToken, undefined, 280);

  return (
    <>
      <ReturnSlipActions bookingId={bookingId} />
      <div className="slip-page-wrap">
        <ReturnSlip
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
