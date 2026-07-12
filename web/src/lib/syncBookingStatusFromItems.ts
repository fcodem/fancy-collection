import prisma from "./prisma";

/** Promote booked → delivered when all items are marked delivered. Never auto-return. */
export async function syncBookingStatusFromItems(bookingId: number) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { bookingItems: true },
  });
  if (!booking || booking.status !== "booked") return booking;

  const items = booking.bookingItems.filter((bi) => !bi.isCancelled);
  if (!items.length || !items.every((bi) => bi.isDelivered)) return booking;

  const itemDeliveredAt = items.map((bi) => bi.deliveredAt).find((d): d is Date => d != null);

  return prisma.booking.update({
    where: { id: bookingId },
    data: {
      status: "delivered",
      deliveredAt: booking.deliveredAt || itemDeliveredAt || new Date(),
    },
  });
}
