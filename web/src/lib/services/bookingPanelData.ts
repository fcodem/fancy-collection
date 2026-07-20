import "server-only";

import prisma from "@/lib/prisma";
import { activeBookingWhere } from "@/lib/bookingActiveStatus";
import { whereDeliveryInRange } from "@/lib/bookingDateQuery";
import { AsyncSemaphore } from "@/lib/asyncSemaphore";
import { memoryCachedQuery } from "@/lib/perfCache";
import { getFreshShopRevision } from "@/lib/realtime/revision";

import { BOOKING_PANEL_PAGE_SIZE } from "@/lib/bookingPanelConstants";

export { BOOKING_PANEL_PAGE_SIZE };

/** Max simultaneous Prisma reads per serverless instance on panel paths. */
const panelReadSem = new AsyncSemaphore(2);

async function limitedRead<T>(task: () => Promise<T>): Promise<T> {
  return panelReadSem.run(task);
}

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

const YEAR_BOUNDS_TTL = 300;

export async function loadBookingPanelYearBounds() {
  return memoryCachedQuery(
    ["booking-panel-year-bounds"],
    () =>
      limitedRead(() =>
        prisma.booking.aggregate({
          where: activeBookingWhere(),
          _min: { deliveryDate: true },
          _max: { deliveryDate: true },
        }),
      ),
    YEAR_BOUNDS_TTL,
  );
}

async function loadBookingPanelPageUncached(opts: {
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

  const yearBounds = await loadBookingPanelYearBounds();

  const [totalCount, statusCounts] = await Promise.all([
    limitedRead(() => prisma.booking.count({ where })),
    limitedRead(() =>
      prisma.booking.groupBy({
        by: ["status"],
        where,
        _count: { _all: true },
      }),
    ),
  ]);

  const bookings = await limitedRead(() =>
    prisma.booking.findMany({
      where,
      select: bookingPanelSelect,
      orderBy: [{ deliveryDate: "asc" }, { monthlySerial: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  );

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

export async function loadBookingPanelPage(opts: {
  year: number;
  month: number | null;
  panelFrom: string;
  panelTo: string;
  page: number;
  pageSize?: number;
}) {
  const revision = await getFreshShopRevision();
  const cacheKey = [
    "booking-panel-page",
    revision,
    String(opts.year),
    String(opts.month ?? "all"),
    opts.panelFrom,
    opts.panelTo,
    String(opts.page),
    String(opts.pageSize ?? BOOKING_PANEL_PAGE_SIZE),
  ];
  return memoryCachedQuery(
    cacheKey,
    () => loadBookingPanelPageUncached(opts),
    20,
  );
}

/** Full filtered set for PDF export only (authorized route). */
export async function loadBookingPanelForPdf(opts: {
  panelFrom: string;
  panelTo: string;
}) {
  const panelDeliveryWhere = await whereDeliveryInRange(opts.panelFrom, opts.panelTo);
  const where = { ...activeBookingWhere(), ...panelDeliveryWhere };
  return limitedRead(() =>
    prisma.booking.findMany({
      where,
      select: bookingPanelSelect,
      orderBy: [{ deliveryDate: "asc" }, { monthlySerial: "asc" }],
    }),
  );
}

/** Test hook — expose semaphore for concurrency assertions. */
export function __bookingPanelReadSemForTests() {
  return panelReadSem;
}
