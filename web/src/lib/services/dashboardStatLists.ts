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

function serializeRow(b: Awaited<ReturnType<typeof fetchStatListRaw>>[number]): DashboardStatBookingRow {
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
    ...std,
  };
}

async function fetchStatListRaw(listType: DashboardStatListType) {
  const todayStr = todayIso();

  switch (listType) {
    case "total-orders":
      return prisma.booking.findMany({
        where: await whereDeliveryInRange(todayStr, todayStr),
        include: bookingInclude,
        orderBy: { deliveryTime: "asc" },
      });
    case "delivered-today":
      return prisma.booking.findMany({
        where: { ...(await whereDeliveryInRange(todayStr, todayStr)), status: "delivered" },
        include: bookingInclude,
        orderBy: { deliveryTime: "asc" },
      });
    case "remaining-to-deliver":
      return prisma.booking.findMany({
        where: await whereRemainingToDeliver(todayStr),
        include: bookingInclude,
        orderBy: [{ deliveryDate: "asc" }, { deliveryTime: "asc" }],
      });
    case "returning-today":
      return prisma.booking.findMany({
        where: {
          ...(await whereReturnInRange(todayStr, todayStr)),
          status: { in: ["booked", "delivered"] },
        },
        include: bookingInclude,
        orderBy: { returnTime: "asc" },
      });
  }
}

export async function getDashboardStatList(listType: DashboardStatListType) {
  const rows = await fetchStatListRaw(listType);
  const span = dateSpanFromBookings(rows);
  const edgeBookings = span.from ? await fetchWarningEdgeBookings(span.from, span.to) : [];
  const { returning: returningMap, booked: bookedMap } = buildWarningMaps(edgeBookings);

  return rows.map((b) => {
    const items = warningItemsForBooking(b, returningMap, bookedMap);
    return {
      ...serializeRow(b),
      pdfWarningPanels: warningPanelsFromItems(items),
    };
  });
}

/** All categories present in a list (for filter dropdown). */
export function categoriesInList(bookings: DashboardStatBookingRow[]): string[] {
  const set = new Set<string>();
  for (const b of bookings) {
    for (const c of bookingCategories(b)) set.add(c);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}
