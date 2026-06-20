import { redirect, notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { getCurrentUser, isOwner } from "@/lib/auth";
import ServerAppShell from "@/components/ServerAppShell";
import BookingViewClient from "@/components/BookingViewClient";
import BookingQrDisplay from "@/components/BookingQrDisplay";
import { formatDate } from "@/lib/constants";
import { ensureBookingQrToken } from "@/lib/bookingQr";

export const dynamic = "force-dynamic";

export default async function BookingViewPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  if (id === "new") redirect("/booking/new");
  const booking = await prisma.booking.findUnique({
    where: { id: parseInt(id, 10) },
    include: { bookingItems: true, legacyItem: true },
  });
  if (!booking) notFound();
  await ensureBookingQrToken(booking.id);

  return (
    <ServerAppShell>
      <BookingViewClient
        isOwner={isOwner(user)}
        booking={{
          ...booking,
          deliveryDate: formatDate(booking.deliveryDate),
          returnDate: formatDate(booking.returnDate),
        }}
        qrSlot={
          <BookingQrDisplay bookingId={booking.id} qrToken={booking.qrToken} />
        }
      />
    </ServerAppShell>
  );
}
