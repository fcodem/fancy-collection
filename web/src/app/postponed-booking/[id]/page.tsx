import { redirect, notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import PostponedBookingDetailClient from "@/components/PostponedBookingDetailClient";
import { formatDate } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function PostponedBookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
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

  let postponedAtDisplay: string | null = null;
  if (booking.status === "postponed") {
    const rows = await prisma.$queryRaw<{ postponed_at: Date | null }[]>`
      SELECT postponed_at FROM bookings WHERE id = ${bookingId}
    `;
    postponedAtDisplay = rows[0]?.postponed_at
      ? formatDate(rows[0].postponed_at, "display")
      : null;
  }

  return (
    <PostponedBookingDetailClient
        status={booking.status}
        totalAdvance={booking.totalAdvance || booking.advance || 0}
        postponedAt={postponedAtDisplay}
        booking={{
          ...booking,
          deliveryDate: formatDate(booking.deliveryDate),
          returnDate: formatDate(booking.returnDate),
        }}
      />
  );
}
