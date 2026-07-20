import "server-only";

import prisma from "@/lib/prisma";
import { whereReturnBefore } from "@/lib/bookingDateQuery";
import { formatDate, localTodayStart, todayIso } from "@/lib/constants";
import { limitedDbRead } from "@/lib/readDbLimit";
import { memoryCachedQuery } from "@/lib/perfCache";
import { getFreshShopRevision } from "@/lib/realtime/revision";
import { LATE_RETURN_PAGE_SIZE } from "@/lib/menuPerf";
import { serializeStandardBookingDetails } from "@/lib/bookingDetails";

export const lateReturnSelect = {
  id: true,
  bookingNumber: true,
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
  totalPrice: true,
  price: true,
  totalAdvance: true,
  advance: true,
  totalRemaining: true,
  remaining: true,
  commonNotes: true,
  notes: true,
  securityDeposit: true,
  status: true,
  itemId: true,
  dressName: true,
  bookingItems: {
    select: {
      itemId: true,
      dressName: true,
      category: true,
      size: true,
      notes: true,
      isDelivered: true,
      isReturned: true,
      isIncompleteReturn: true,
      isCancelled: true,
    },
  },
  legacyItem: { select: { size: true, category: true } },
} as const;

export type LateReturnRow = Awaited<
  ReturnType<typeof loadLateReturnPage>
>["rows"][number];

/** Days late using Asia/Kolkata business calendar date. */
export function daysLateForReturn(returnDate: Date, today = localTodayStart()): number {
  const retDay = new Date(returnDate);
  retDay.setUTCHours(0, 0, 0, 0);
  const diff = today.getTime() - retDay.getTime();
  return Math.max(0, Math.floor(diff / 86400000));
}

export async function loadLateReturnPage(opts?: { page?: number; pageSize?: number }) {
  const page = Math.max(1, opts?.page ?? 1);
  const pageSize = Math.min(LATE_RETURN_PAGE_SIZE, Math.max(1, opts?.pageSize ?? LATE_RETURN_PAGE_SIZE));
  const today = localTodayStart();
  const returnWhere = await whereReturnBefore(todayIso());
  const where = { ...returnWhere, status: "delivered" as const };

  const [total, rows] = await Promise.all([
    limitedDbRead(() => prisma.booking.count({ where })),
    limitedDbRead(() =>
      prisma.booking.findMany({
        where,
        select: lateReturnSelect,
        orderBy: [{ returnDate: "asc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ),
  ]);

  return {
    rows: rows.map((b) => ({
      id: b.id,
      monthlySerial: b.monthlySerial,
      daysLate: daysLateForReturn(b.returnDate, today),
      details: serializeStandardBookingDetails(b),
    })),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export function loadLateReturnPageCached(opts?: { page?: number; pageSize?: number }) {
  const page = opts?.page ?? 1;
  const pageSize = opts?.pageSize ?? LATE_RETURN_PAGE_SIZE;
  return getFreshShopRevision().then((rev) =>
    memoryCachedQuery(
      ["late-return-page", rev, String(page), String(pageSize)],
      () => loadLateReturnPage({ page, pageSize }),
      25,
    ),
  );
}

export async function loadLateReturnExport() {
  const today = localTodayStart();
  const returnWhere = await whereReturnBefore(todayIso());
  const where = { ...returnWhere, status: "delivered" as const };
  const rows = await limitedDbRead(() =>
    prisma.booking.findMany({
      where,
      select: lateReturnSelect,
      orderBy: [{ returnDate: "asc" }, { id: "asc" }],
      take: 500,
    }),
  );
  return rows.map((b) => ({
    booking: b,
    daysLate: daysLateForReturn(b.returnDate, today),
    deliveryIso: formatDate(b.deliveryDate, "iso"),
    returnIso: formatDate(b.returnDate, "iso"),
  }));
}
