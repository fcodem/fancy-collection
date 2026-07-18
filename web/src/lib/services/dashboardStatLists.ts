import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { todayIso } from "@/lib/constants";
import {
  whereDeliveryInRange,
  whereReturnInRange,
  whereRemainingToDeliver,
} from "@/lib/bookingDateQuery";
import { serializeStandardBookingDetails } from "@/lib/bookingDetails";
import { bookingCategories, type StatListBooking } from "@/lib/dashboardStatListFilter";
import {
  buildWarningMaps,
  dateSpanFromBookings,
  fetchWarningEdgeBookings,
  warningItemsForBooking,
} from "@/lib/bookingWarnings";
import { warningPanelsFromItems } from "@/lib/bookingWarningPdf";
import type { PdfWarningPanel } from "@/lib/pdfWarningDraw";
import {
  DASHBOARD_STAT_DEFAULT_PAGE_SIZE,
  DASHBOARD_STAT_MAX_PAGE_SIZE,
  searchPageMeta,
  type SearchPageMeta,
} from "@/lib/searchPagination";

export type DashboardStatListType =
  | "total-orders"
  | "delivered-today"
  | "remaining-to-deliver"
  | "returning-today";

export const DASHBOARD_STAT_LISTS: Record<
  DashboardStatListType,
  { title: string; description: string }
> = {
  "total-orders": {
    title: "Today's Total Orders",
    description: "All bookings scheduled for delivery today",
  },
  "delivered-today": {
    title: "Delivered Today",
    description: "Bookings marked delivered today",
  },
  "remaining-to-deliver": {
    title: "Remaining to Deliver",
    description: "Undelivered bookings due today or overdue",
  },
  "returning-today": {
    title: "Returning Today",
    description: "Bookings due for return today",
  },
};

export function parseDashboardStatListType(raw: string): DashboardStatListType | null {
  if (raw in DASHBOARD_STAT_LISTS) return raw as DashboardStatListType;
  return null;
}

const bookingInclude = {
  bookingItems: { include: { item: true } },
  legacyItem: true,
} as const;

export type DashboardStatBookingRow = StatListBooking &
  ReturnType<typeof serializeStandardBookingDetails> & {
    totalAdvance: number;
    totalRemaining: number;
    remainingCollected: number;
    deliveryDateIso: string;
    pdfWarningPanels: PdfWarningPanel[];
  };

export type DashboardStatListPage = SearchPageMeta & {
  listType: DashboardStatListType;
  bookings: DashboardStatBookingRow[];
};

function serializeRow(
  b: Awaited<ReturnType<typeof fetchStatListPageRaw>>["rows"][number],
): DashboardStatBookingRow {
  const std = serializeStandardBookingDetails(b);
  return {
    id: b.id,
    monthlySerial: b.monthlySerial,
    customerName: b.customerName,
    contact1: b.contact1,
    whatsappNo: b.whatsappNo,
    status: b.status,
    dressName: b.dressName,
    bookingItems: b.bookingItems,
    legacyItem: b.legacyItem,
    totalAdvance: b.totalAdvance ?? b.advance ?? 0,
    totalRemaining: b.totalRemaining ?? b.remaining ?? 0,
    remainingCollected: b.remainingCollected ?? 0,
    deliveryDateIso: b.deliveryDate.toISOString().slice(0, 10),
    pdfWarningPanels: [] as PdfWarningPanel[],
    ...std,
  };
}

function collectItemIds(
  rows: Array<{
    itemId?: number | null;
    bookingItems: Array<{ itemId: number | null }>;
  }>,
): number[] {
  const ids = new Set<number>();
  for (const b of rows) {
    if (b.itemId != null) ids.add(b.itemId);
    for (const bi of b.bookingItems) {
      if (bi.itemId != null) ids.add(bi.itemId);
    }
  }
  return [...ids];
}

async function whereForListType(listType: DashboardStatListType): Promise<Prisma.BookingWhereInput> {
  const todayStr = todayIso();
  switch (listType) {
    case "total-orders":
      return whereDeliveryInRange(todayStr, todayStr);
    case "delivered-today":
      return { ...(await whereDeliveryInRange(todayStr, todayStr)), status: "delivered" };
    case "remaining-to-deliver":
      return whereRemainingToDeliver(todayStr);
    case "returning-today":
      return {
        ...(await whereReturnInRange(todayStr, todayStr)),
        status: { in: ["booked", "delivered"] },
      };
  }
}

function orderForListType(
  listType: DashboardStatListType,
): Prisma.BookingOrderByWithRelationInput | Prisma.BookingOrderByWithRelationInput[] {
  switch (listType) {
    case "total-orders":
    case "delivered-today":
      return { deliveryTime: "asc" };
    case "remaining-to-deliver":
      return [{ deliveryDate: "asc" }, { deliveryTime: "asc" }];
    case "returning-today":
      return { returnTime: "asc" };
  }
}

export function parseDashboardStatPageParams(
  pageRaw?: string | number | null,
  pageSizeRaw?: string | number | null,
): { page: number; pageSize: number; skip: number } {
  const page = Math.max(1, parseInt(String(pageRaw ?? "1"), 10) || 1);
  const requested =
    parseInt(String(pageSizeRaw ?? String(DASHBOARD_STAT_DEFAULT_PAGE_SIZE)), 10) ||
    DASHBOARD_STAT_DEFAULT_PAGE_SIZE;
  const pageSize = Math.min(DASHBOARD_STAT_MAX_PAGE_SIZE, Math.max(1, requested));
  return { page, pageSize, skip: (page - 1) * pageSize };
}

async function fetchStatListPageRaw(
  listType: DashboardStatListType,
  page: number,
  pageSize: number,
) {
  const where = await whereForListType(listType);
  const orderBy = orderForListType(listType);
  const skip = (page - 1) * pageSize;
  const [total, rows] = await Promise.all([
    prisma.booking.count({ where }),
    prisma.booking.findMany({
      where,
      include: bookingInclude,
      orderBy,
      skip,
      take: pageSize,
    }),
  ]);
  return { total, rows };
}

async function attachWarnings(
  rows: Awaited<ReturnType<typeof fetchStatListPageRaw>>["rows"],
): Promise<DashboardStatBookingRow[]> {
  const itemIds = collectItemIds(rows);
  const span = dateSpanFromBookings(rows);
  const edgeBookings =
    span.from && itemIds.length
      ? await fetchWarningEdgeBookings(span.from, span.to, {
          itemIds,
          // Bound edge fan-out even when the date span is wide (remaining-to-deliver).
          take: Math.min(400, Math.max(50, itemIds.length * 8)),
        })
      : [];
  const { returning: returningMap, booked: bookedMap } = buildWarningMaps(edgeBookings);

  return rows.map((b) => {
    const items = warningItemsForBooking(b, returningMap, bookedMap);
    return {
      ...serializeRow(b),
      pdfWarningPanels: warningPanelsFromItems(items),
    };
  });
}

export async function getDashboardStatListPage(
  listType: DashboardStatListType,
  opts?: { page?: string | number | null; pageSize?: string | number | null },
): Promise<DashboardStatListPage> {
  const { page, pageSize } = parseDashboardStatPageParams(opts?.page, opts?.pageSize);
  const { total, rows } = await fetchStatListPageRaw(listType, page, pageSize);
  const bookings = await attachWarnings(rows);
  return {
    listType,
    bookings,
    ...searchPageMeta(total, page, pageSize),
  };
}

/** First page only — prefer getDashboardStatListPage for callers that need paging. */
export async function getDashboardStatList(listType: DashboardStatListType) {
  const page = await getDashboardStatListPage(listType, {
    page: 1,
    pageSize: DASHBOARD_STAT_MAX_PAGE_SIZE,
  });
  return page.bookings;
}

/** All categories present in a list (for filter dropdown). */
export function categoriesInList(bookings: DashboardStatBookingRow[]): string[] {
  const set = new Set<string>();
  for (const b of bookings) {
    for (const c of bookingCategories(b)) set.add(c);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}
