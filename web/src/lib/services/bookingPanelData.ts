import "server-only";

import prisma from "@/lib/prisma";
import { activeBookingWhere } from "@/lib/bookingActiveStatus";
import { whereDeliveryInRange } from "@/lib/bookingDateQuery";
import { memoryCachedQuery } from "@/lib/perfCache";

const bookingPanelInclude = {
  bookingItems: {
    select: {
      itemId: true,
      dressName: true,
      category: true,
      size: true,
      notes: true,
      isDelivered: true,
    },
  },
  legacyItem: { select: { size: true, category: true } },
} as const;

export type BookingPanelPayload = Awaited<ReturnType<typeof loadBookingPanelRaw>>;

async function loadBookingPanelRaw(year: number, month: number | null, panelFrom: string, panelTo: string) {
  const panelDeliveryWhere = await whereDeliveryInRange(panelFrom, panelTo);

  const [yearBounds, bookings, statusCounts] = await Promise.all([
    prisma.booking.aggregate({
      where: activeBookingWhere(),
      _min: { deliveryDate: true },
      _max: { deliveryDate: true },
    }),
    prisma.booking.findMany({
      where: { ...activeBookingWhere(), ...panelDeliveryWhere },
      include: bookingPanelInclude,
      orderBy: [{ deliveryDate: "asc" }, { monthlySerial: "asc" }],
    }),
    prisma.booking.groupBy({
      by: ["status"],
      where: { ...activeBookingWhere(), ...panelDeliveryWhere },
      _count: { _all: true },
    }),
  ]);

  return { yearBounds, bookings, statusCounts };
}

/** Short TTL — booking create broadcasts invalidate tags but panel uses memory cache across warm isolates. */
export function getBookingPanelDataCached(
  year: number,
  month: number | null,
  panelFrom: string,
  panelTo: string,
) {
  const monthKey = month == null ? "all" : String(month);
  return memoryCachedQuery(
    ["booking-panel", String(year), monthKey, panelFrom, panelTo],
    () => loadBookingPanelRaw(year, month, panelFrom, panelTo),
    30,
  );
}
