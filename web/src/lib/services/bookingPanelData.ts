import "server-only";

import prisma from "@/lib/prisma";
import { activeBookingWhere } from "@/lib/bookingActiveStatus";
import { whereDeliveryInRange } from "@/lib/bookingDateQuery";
import { bookingMonthKey } from "@/lib/bookingMonth";
import { AsyncSemaphore } from "@/lib/asyncSemaphore";
import { memoryCachedQuery } from "@/lib/perfCache";
import { getFreshShopRevision } from "@/lib/realtime/revision";
import type { Prisma } from "@prisma/client";

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
  remainingCollected: true,
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
      itemRemainingCollected: true,
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

type PanelSortRow = { id: number; monthlySerial: number; deliveryDate: Date };

function comparePanelSerialOrder(a: PanelSortRow, b: PanelSortRow): number {
  const monthCmp = bookingMonthKey(a.deliveryDate).localeCompare(bookingMonthKey(b.deliveryDate));
  if (monthCmp !== 0) return monthCmp;
  if (a.monthlySerial !== b.monthlySerial) return a.monthlySerial - b.monthlySerial;
  return a.id - b.id;
}

async function fetchBookingsByOrderedIds(ids: number[]) {
  if (!ids.length) return [];
  const rows = await prisma.booking.findMany({
    where: { id: { in: ids } },
    select: bookingPanelSelect,
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => Boolean(r));
}

async function loadBookingsPanelOrdered(opts: {
  where: Prisma.BookingWhereInput;
  month: number | null;
  skip: number;
  take: number;
  returned?: boolean;
}) {
  if (opts.returned) {
    return prisma.booking.findMany({
      where: opts.where,
      select: bookingPanelSelect,
      orderBy: [{ returnDate: "desc" }, { monthlySerial: "asc" }, { id: "asc" }],
      skip: opts.skip,
      take: opts.take,
    });
  }

  if (opts.month != null) {
    return prisma.booking.findMany({
      where: opts.where,
      select: bookingPanelSelect,
      orderBy: [{ monthlySerial: "asc" }, { id: "asc" }],
      skip: opts.skip,
      take: opts.take,
    });
  }

  const rows = await prisma.booking.findMany({
    where: opts.where,
    select: { id: true, monthlySerial: true, deliveryDate: true },
  });
  rows.sort(comparePanelSerialOrder);
  const pageIds = rows.slice(opts.skip, opts.skip + opts.take).map((r) => r.id);
  return fetchBookingsByOrderedIds(pageIds);
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
  const activeWhere = {
    ...panelDeliveryWhere,
    status: { in: ["booked", "delivered"] as string[] },
  };
  const returnedWhere = {
    ...panelDeliveryWhere,
    status: "returned",
  };
  const statsWhere = { ...activeBookingWhere(), ...panelDeliveryWhere };

  const yearBounds = await loadBookingPanelYearBounds();

  const [totalCount, statusCounts, bookings, returnedBookings] = await Promise.all([
    limitedRead(() => prisma.booking.count({ where: activeWhere })),
    limitedRead(() =>
      prisma.booking.groupBy({
        by: ["status"],
        where: statsWhere,
        _count: { _all: true },
      }),
    ),
    limitedRead(() =>
      loadBookingsPanelOrdered({
        where: activeWhere,
        month: opts.month,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ),
    limitedRead(() =>
      loadBookingsPanelOrdered({
        where: returnedWhere,
        month: opts.month,
        skip: 0,
        take: 80,
        returned: true,
      }),
    ),
  ]);

  return {
    yearBounds,
    bookings,
    returnedBookings,
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
  month?: number | null;
}) {
  const panelDeliveryWhere = await whereDeliveryInRange(opts.panelFrom, opts.panelTo);
  const where = { ...activeBookingWhere(), ...panelDeliveryWhere };
  return limitedRead(() =>
    loadBookingsPanelOrdered({
      where,
      month: opts.month ?? null,
      skip: 0,
      take: 10_000,
    }),
  );
}

/** Test hook — expose semaphore for concurrency assertions. */
export function __bookingPanelReadSemForTests() {
  return panelReadSem;
}
