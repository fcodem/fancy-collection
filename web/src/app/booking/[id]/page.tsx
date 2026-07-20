import { Suspense } from "react";
import { redirect, notFound } from "next/navigation";
import { getCurrentUserForLayout, isOwner } from "@/lib/auth";
import BookingViewClient from "@/components/BookingViewClient";
import BookingQrDisplay from "@/components/BookingQrDisplay";
import BookingQrSkeleton from "@/components/BookingQrSkeleton";
import BookingWarningsAsync from "@/components/BookingWarningsAsync";
import BookingWarningsSkeleton from "@/components/BookingWarningsSkeleton";
import { loadCachedBookingRecordCore } from "@/lib/services/bookingRecordCache";
import {
  serializeBookingRecordForView,
  serializeBookingRecordOrders,
} from "@/lib/services/bookingRecordData";
import { createBookingRecordPerfTimer } from "@/lib/services/bookingRecordPerf";

export const dynamic = "force-dynamic";

export default async function BookingViewPage({ params }: { params: Promise<{ id: string }> }) {
  const perf = createBookingRecordPerfTimer();
  perf.mark("auth");

  const user = await getCurrentUserForLayout();
  if (!user) redirect("/login");
  perf.endStage("authMs", "auth");

  const { id } = await params;
  if (id === "new") redirect("/booking/new");

  const bookingId = parseInt(id, 10);
  if (!Number.isFinite(bookingId) || bookingId <= 0) notFound();

  perf.mark("core");
  const core = await loadCachedBookingRecordCore(bookingId);
  perf.endStage("queryMs", "core");
  perf.addQueries(1);

  if (!core) notFound();

  perf.mark("serialize");
  const booking = serializeBookingRecordForView(core);
  const orders = serializeBookingRecordOrders(core.orders);
  perf.endStage("serializeMs", "serialize");

  perf.finish({ kind: "read", forceLog: process.env.PERF_LOG_BOOKING_RECORD === "1" });

  return (
    <BookingViewClient
      isOwner={isOwner(user)}
      warningItems={[]}
      orders={orders}
      booking={booking}
      warningsSlot={
        <Suspense fallback={<BookingWarningsSkeleton />}>
          <BookingWarningsAsync booking={core} />
        </Suspense>
      }
      qrSlot={
        <Suspense fallback={<BookingQrSkeleton />}>
          <BookingQrDisplay bookingId={booking.id} qrToken={core.qrToken} />
        </Suspense>
      }
    />
  );
}
