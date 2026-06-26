import prisma from "./prisma";

export type InactiveBookingStats = {
  cancelled_count: number;
  cancelled_amount: number;
  postponed_count: number;
  postponed_amount: number;
};

type BookingForAmount = {
  id: number;
  totalPrice: number;
  price: number;
  bookingItems: Array<{ price: number }>;
};

function bookingTotalAmount(b: BookingForAmount): number {
  if (b.bookingItems.length) {
    return b.bookingItems.reduce((sum, bi) => sum + (bi.price || 0), 0);
  }
  return b.totalPrice || b.price || 0;
}

/** Cancelled/postponed bookings whose action fell within [from, to). */
export async function getInactiveBookingStats(from: Date, to: Date): Promise<InactiveBookingStats> {
  const [postponed, cancelledWithRefund, cancelLogs] = await Promise.all([
    prisma.booking.findMany({
      where: { status: "postponed", postponedAt: { gte: from, lt: to } },
      include: { bookingItems: true },
    }),
    prisma.booking.findMany({
      where: { status: "cancelled", refundedAt: { gte: from, lt: to } },
      include: { bookingItems: true },
    }),
    prisma.activityLog.findMany({
      where: {
        action: "cancelled",
        entity: "booking",
        createdAt: { gte: from, lt: to },
      },
      select: { entityId: true },
    }),
  ]);

  const cancelledById = new Map<number, BookingForAmount>();
  for (const b of cancelledWithRefund) cancelledById.set(b.id, b);

  const extraIds = [
    ...new Set(
      cancelLogs
        .map((l) => l.entityId)
        .filter((id): id is number => id != null && !cancelledById.has(id)),
    ),
  ];

  if (extraIds.length) {
    const extra = await prisma.booking.findMany({
      where: { id: { in: extraIds }, status: "cancelled" },
      include: { bookingItems: true },
    });
    for (const b of extra) cancelledById.set(b.id, b);
  }

  const cancelled = [...cancelledById.values()];

  return {
    cancelled_count: cancelled.length,
    cancelled_amount: cancelled.reduce((sum, b) => sum + bookingTotalAmount(b), 0),
    postponed_count: postponed.length,
    postponed_amount: postponed.reduce((sum, b) => sum + bookingTotalAmount(b), 0),
  };
}
