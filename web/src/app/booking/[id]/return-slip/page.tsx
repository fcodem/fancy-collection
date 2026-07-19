import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { ensureBookingQrToken, bookingQrDataUrl } from "@/lib/bookingQr";
import ReturnSlip from "@/components/ReturnSlip";
import ReturnSlipActions from "./ReturnSlipActions";
import { isReturnSlipEligible, resolveReturnSlip } from "@/lib/bookingStatus";
import { buildReturnSlipData, SLIP_BIZ } from "@/lib/slipBookingData";
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
        include: { item: { select: { color: true, photo: true, originalPhoto: true, sku: true } } },
      },
      orders: { where: { status: "active" }, orderBy: { id: "asc" } },
    },
  });
  if (!booking) notFound();

  if (!isReturnSlipEligible(booking)) {
    redirect(`/booking/${bookingId}`);
  }

  let slipData;
  let resolvedActionItemIds: number[] | undefined;
  const bookingItemIds = parseBookingItemIdsParam(itemsParam);
  try {
    if (pdfRender && bookingItemIds?.length) {
      slipData = buildReturnSlipData(booking, {
        scope:
          scopeParam === "full"
            ? "full"
            : bookingItemIds.length === 1
              ? "single"
              : "combined",
        bookingItemId: bookingItemIds.length === 1 ? bookingItemIds[0] : undefined,
        bookingItemIds,
      });
      resolvedActionItemIds = bookingItemIds;
    } else if (pdfRender && scopeParam === "combined") {
      slipData = buildReturnSlipData(booking, { scope: "combined" });
    } else if (pdfRender && scopeParam === "full") {
      slipData = buildReturnSlipData(booking, { scope: "full" });
    } else if (pdfRender && scopeParam === "single" && itemParam) {
      const id = parseInt(itemParam, 10);
      slipData = buildReturnSlipData(booking, {
        scope: "single",
        bookingItemId: id,
      });
      resolvedActionItemIds = [id];
    } else if (bookingItemIds?.length) {
      slipData = buildReturnSlipData(booking, {
        scope: bookingItemIds.length === 1 ? "single" : "combined",
        bookingItemId: bookingItemIds.length === 1 ? bookingItemIds[0] : undefined,
        bookingItemIds,
      });
      resolvedActionItemIds = bookingItemIds;
    } else {
      const resolved = resolveReturnSlip(booking, itemParam);
      if (resolved === "invalid") {
        redirect(`/return/${bookingId}`);
      }
      slipData = buildReturnSlipData(booking, {
        scope: resolved.scope,
        bookingItemId: resolved.scope === "single" ? resolved.bookingItemId : undefined,
      });
      if (resolved.scope === "single") {
        resolvedActionItemIds = [resolved.bookingItemId];
      } else if (resolved.scope === "combined") {
        resolvedActionItemIds = booking.bookingItems
          .filter((bi) => bi.isReturned && !bi.isIncompleteReturn && !bi.isCancelled)
          .map((bi) => bi.id);
      }
    }
  } catch {
    redirect(`/return/${bookingId}`);
  }

  const { booking: slipBooking, items, orders: slipOrders, slipSubtitle } = slipData;

  const qrToken = await ensureBookingQrToken(bookingId);
  const qrDataUrl = await bookingQrDataUrl(qrToken, undefined, 280);

  const actionItemIds = resolvedActionItemIds;

  return (
    <>
      {pdfRender && <SlipPdfPrintStyles />}
      {!pdfRender && (
        <ReturnSlipActions
          bookingId={bookingId}
          autoPrint={print === "1"}
        />
      )}
      <div className="slip-page-wrap">
        <ReturnSlip
          booking={slipBooking}
          items={items}
          orders={slipOrders}
          qrDataUrl={qrDataUrl}
          businessName={SLIP_BIZ.name}
          businessPhone={SLIP_BIZ.phone}
          businessAddress={SLIP_BIZ.address}
          slipSubtitle={slipSubtitle}
          printMode={pdfRender}
        />
      </div>
    </>
  );
}
