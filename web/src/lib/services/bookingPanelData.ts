import "server-only";

import prisma from "@/lib/prisma";
import { activeBookingWhere } from "@/lib/bookingActiveStatus";
import { whereDeliveryInRange } from "@/lib/bookingDateQuery";

import { BOOKING_PANEL_PAGE_SIZE } from "@/lib/bookingPanelConstants";

export { BOOKING_PANEL_PAGE_SIZE };

const bookingPanelSelect = {
  id: true,
  monthlySerial: true,
  customerName: true,
  customerAddress: true,
  contact1: true,
  whatsappNo: true,
  venue: true,
  staffNames: true,
  deliveryDate: true,
  deliveryTime: true,
  returnDate: true,
  returnTime: true,
  securityDeposit: true,
  totalPrice: true,
  totalAdvance: true,
  totalRemaining: true,
  price: true,
  advance: true,
  remaining: true,
  commonNotes: true,
  status: true,
  createdAt: true,
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

export type BookingPanelRow = Awaited<
  ReturnType<typeof loadBookingPanelPage>
>["bookings"][number];

export async function loadBookingPanelPage(opts: {
  year: number;
  month: number | null;
  panelFrom: string;
  panelTo: string;
  page: number;
  pageSize?: number;
}) {
  const pageSize = opts.pageSize ?? BOOKING_PANEL_PAGE_SIZE;
  const page = Math.max(1, opts.page || 1);
  const panelDeliveryWhere = await whereDeliveryInRange(opts.panelFrom, opts.panelTo);
  const where = { ...activeBookingWhere(), ...panelDeliveryWhere };

  const [yearBounds, totalCount, statusCounts, bookings] = await Promise.all([
    prisma.booking.aggregate({
      where: activeBookingWhere(),
      _min: { deliveryDate: true },
      _max: { deliveryDate: true },
    }),
    prisma.booking.count({ where }),
    prisma.booking.groupBy({
      by: ["status"],
      where,
      _count: { _all: true },
    }),
    prisma.booking.findMany({
      where,
      select: bookingPanelSelect,
      orderBy: [{ deliveryDate: "asc" }, { monthlySerial: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    yearBounds,
    bookings,
    statusCounts,
    totalCount,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
  };
}

/** Full filtered set for PDF export only (authorized route). */
export async function loadBookingPanelForPdf(opts: {
  panelFrom: string;
  panelTo: string;
}) {
  const panelDeliveryWhere = await whereDeliveryInRange(opts.panelFrom, opts.panelTo);
  const where = { ...activeBookingWhere(), ...panelDeliveryWhere };
  return prisma.booking.findMany({
    where,
    select: bookingPanelSelect,
    orderBy: [{ deliveryDate: "asc" }, { monthlySerial: "asc" }],
  });
}
