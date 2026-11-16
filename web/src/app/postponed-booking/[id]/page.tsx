import { redirect, notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { getCurrentUserReadOnly } from "@/lib/auth";
import PostponedBookingDetailClient from "@/components/PostponedBookingDetailClient";
import { formatDate } from "@/lib/constants";
import { dressDisplayName } from "@/lib/dress";

export const dynamic = "force-dynamic";

export default async function PostponedBookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUserReadOnly();
  if (!user) redirect("/login");

  const { id } = await params;
  const bookingId = parseInt(id, 10);
  if (!Number.isFinite(bookingId)) notFound();

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      bookingItems: true,
      legacyItem: { select: { category: true, size: true } },
    },
  });
  if (!booking) notFound();

  const allowed = booking.status === "booked" || booking.status === "postponed";
  if (!allowed) {
    redirect(`/booking/${booking.id}`);
  }

  const postponedAtDisplay =
    booking.status === "postponed" && booking.postponedAt
      ? formatDate(booking.postponedAt, "display")
      : null;

  return (
    <PostponedBookingDetailClient
        status={booking.status}
        totalAdvance={booking.totalAdvance || booking.advance || 0}
        postponedAt={postponedAtDisplay}
        dresses={booking.bookingItems
          .filter((bi) => !bi.isCancelled)
          .map((bi) => ({
            id: bi.id,
            dressName: dressDisplayName(bi.dressName, bi.category, bi.size),
            price: bi.price || 0,
            advance: bi.advance || 0,
            isDelivered: bi.isDelivered || bi.isReturned,
          }))}
        booking={{
          ...booking,
          deliveryDate: formatDate(booking.deliveryDate),
          returnDate: formatDate(booking.returnDate),
        }}
      />
  );
}
