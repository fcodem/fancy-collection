import { Suspense } from "react";
import { redirect, notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { getCurrentUser, isOwner } from "@/lib/auth";
import ServerAppShell from "@/components/ServerAppShell";
import BookingViewClient from "@/components/BookingViewClient";
import BookingQrDisplay from "@/components/BookingQrDisplay";
import BookingQrSkeleton from "@/components/BookingQrSkeleton";
import { formatDate } from "@/lib/constants";
import { loadWarningItemsForBooking } from "@/lib/bookingWarnings";

export const dynamic = "force-dynamic";

export default async function BookingViewPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  if (id === "new") redirect("/booking/new");

  const booking = await prisma.booking.findUnique({
    where: { id: parseInt(id, 10) },
    include: {
      bookingItems: true,
      legacyItem: { select: { category: true, size: true } },
    },
  });
  if (!booking) notFound();

  const warningItems = await loadWarningItemsForBooking(booking);

  return (
    <ServerAppShell>
      <BookingViewClient
        isOwner={isOwner(user)}
        warningItems={warningItems}
        booking={{
          ...booking,
          deliveryDate: formatDate(booking.deliveryDate),
          returnDate: formatDate(booking.returnDate),
        }}
        qrSlot={
          <Suspense fallback={<BookingQrSkeleton />}>
            <BookingQrDisplay bookingId={booking.id} qrToken={booking.qrToken} />
          </Suspense>
        }
      />
    </ServerAppShell>
  );
}
