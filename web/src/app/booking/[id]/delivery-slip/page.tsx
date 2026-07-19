import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { ensureBookingQrToken, bookingQrDataUrl } from "@/lib/bookingQr";
import DeliverySlip from "@/components/DeliverySlip";
import DeliverySlipActions from "./DeliverySlipActions";
import { isDeliverySlipEligible, resolveDeliverySlipItemId } from "@/lib/bookingStatus";
import { buildDeliverySlipData, SLIP_BIZ } from "@/lib/slipBookingData";
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
  searchParams: Promise<{ item?: string; items?: string; pdfSecret?: string; scope?: string; print?: string }>;
}) {
  const { id } = await params;
  const { item: itemParam, items: itemsParam, pdfSecret, scope: scopeParam, print } = await searchParams;
  const bookingId = parseInt(id, 10);

  await requireSlipPageAccess(pdfSecret);
  const pdfRender = isValidPdfRenderSecret(pdfSecret);

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      bookingItems: {
        include: { item: { select: { color: true, sku: true, photo: true, originalPhoto: true } } },
      },
      orders: { where: { status: "active" }, orderBy: { id: "asc" } },
    },
  });
  if (!booking) notFound();

  if (!isDeliverySlipEligible(booking)) {
    redirect(`/booking/${bookingId}/slip`);
  }

  let slipData;
  const bookingItemIds = parseBookingItemIdsParam(itemsParam);
  try {
    if (pdfRender && bookingItemIds?.length) {
      slipData = buildDeliverySlipData(booking, {
        scope:
          scopeParam === "full"
            ? "full"
            : bookingItemIds.length === 1
              ? "single"
              : "combined",
        bookingItemId: bookingItemIds.length === 1 ? bookingItemIds[0] : undefined,
        bookingItemIds,
      });
    } else if (pdfRender && scopeParam === "combined") {
      slipData = buildDeliverySlipData(booking, { scope: "combined" });
    } else if (pdfRender && scopeParam === "full") {
      slipData = buildDeliverySlipData(booking, { scope: "full" });
    } else if (pdfRender && scopeParam === "single" && itemParam) {
      slipData = buildDeliverySlipData(booking, {
        bookingItemId: parseInt(itemParam, 10),
      });
    } else if (bookingItemIds?.length) {
      slipData = buildDeliverySlipData(booking, {
        scope: bookingItemIds.length === 1 ? "single" : "combined",
        bookingItemId: bookingItemIds.length === 1 ? bookingItemIds[0] : undefined,
        bookingItemIds,
      });
    } else {
      const slipItemId = resolveDeliverySlipItemId(booking, itemParam);
      if (slipItemId === "pick") {
        redirect(`/booking-delivery/${bookingId}`);
      }
      slipData = buildDeliverySlipData(booking, {
        bookingItemId: slipItemId,
      });
    }
  } catch {
    redirect(`/booking-delivery/${bookingId}`);
  }

  const { booking: slipBooking, items, orders: slipOrders, slipSubtitle } = slipData;

  const qrToken = await ensureBookingQrToken(bookingId);
  const qrDataUrl = await bookingQrDataUrl(qrToken, undefined, 280);

  return (
    <>
      {pdfRender && <SlipPdfPrintStyles />}
      {!pdfRender && <DeliverySlipActions bookingId={bookingId} autoPrint={print === "1"} />}
      <div className="slip-page-wrap">
        <DeliverySlip
          booking={slipBooking}
          items={items}
          orders={slipOrders}
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
