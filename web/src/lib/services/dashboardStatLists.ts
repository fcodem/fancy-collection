import prisma, { todayStartQ, todayEndQ } from "@/lib/prisma";
import { serializeStandardBookingDetails } from "@/lib/bookingDetails";
import { bookingCategories, type StatListBooking } from "@/lib/dashboardStatListFilter";

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
    totalRemaining: number;
    deliveryDateIso: string;
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
    totalRemaining: b.totalRemaining ?? b.remaining ?? 0,
    deliveryDateIso: b.deliveryDate.toISOString().slice(0, 10),
    ...std,
  };
}

async function fetchStatListRaw(listType: DashboardStatListType) {
  const today = todayStartQ();
  const todayEnd = todayEndQ();

  switch (listType) {
    case "total-orders":
      return prisma.booking.findMany({
        where: { deliveryDate: { gte: today, lt: todayEnd } },
        include: bookingInclude,
        orderBy: { deliveryTime: "asc" },
      });
    case "delivered-today":
      return prisma.booking.findMany({
        where: { deliveryDate: { gte: today, lt: todayEnd }, status: "delivered" },
        include: bookingInclude,
        orderBy: { deliveryTime: "asc" },
      });
    case "remaining-to-deliver":
      return prisma.booking.findMany({
        where: { deliveryDate: { lte: today }, status: "booked" },
        include: bookingInclude,
        orderBy: [{ deliveryDate: "asc" }, { deliveryTime: "asc" }],
      });
    case "returning-today":
      return prisma.booking.findMany({
        where: {
          returnDate: { gte: today, lt: todayEnd },
          status: { in: ["booked", "delivered"] },
        },
        include: bookingInclude,
        orderBy: { returnTime: "asc" },
      });
  }
}

export async function getDashboardStatList(listType: DashboardStatListType) {
  const rows = await fetchStatListRaw(listType);
  return rows.map(serializeRow);
}

/** All categories present in a list (for filter dropdown). */
export function categoriesInList(bookings: DashboardStatBookingRow[]): string[] {
  const set = new Set<string>();
  for (const b of bookings) {
    for (const c of bookingCategories(b)) set.add(c);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}
