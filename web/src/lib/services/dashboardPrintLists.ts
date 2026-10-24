import "server-only";

import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { formatDate, formatBookingDateTime, todayIso } from "@/lib/constants";
import { addDaysIso } from "@/lib/dateInput";
import {
  pendingDeliveryItemsFilter,
  whereRemainingToDeliver,
  whereReturnBefore,
} from "@/lib/bookingDateQuery";
import {
  balanceLeftToCollect,
  effectiveRemainingCollected,
  effectiveSecurityCollected,
} from "@/lib/bookingDetails";
import { bookingItemSize, dressDisplayName } from "@/lib/dress";
import { limitedDbRead } from "@/lib/readDbLimit";

import type { DashboardPrintKind, DashboardPrintScope, PrintBookingRecord, PrintDressRow } from "@/lib/services/dashboardPrintTypes";

export type { DashboardPrintKind, DashboardPrintScope, PrintBookingRecord } from "@/lib/services/dashboardPrintTypes";

export const DASHBOARD_PRINT_MAX = 500;

export function parseDashboardPrintKind(raw: string): DashboardPrintKind | null {
  return raw === "deliveries" || raw === "returns" ? raw : null;
}


async function whereFor(kind: DashboardPrintKind, scope: DashboardPrintScope): Promise<Prisma.BookingWhereInput> {
  const today = todayIso();
  if (kind === "deliveries") {
    return scope === "all"
      ? { status: "booked", ...pendingDeliveryItemsFilter }
      : whereRemainingToDeliver(today);
  }
  return scope === "all"
    ? { status: "delivered" }
    : { ...(await whereReturnBefore(addDaysIso(today, 1))), status: "delivered" };
}

function itemStatus(bi: {
  isDelivered: boolean;
  isReturned: boolean;
  isIncompleteReturn: boolean;
}): string {
  if (bi.isIncompleteReturn) return "Incomplete return";
  if (bi.isReturned) return "Returned";
  if (bi.isDelivered) return "Delivered";
  return "Pending delivery";
}

export async function loadDashboardPrintList(kind: DashboardPrintKind, scope: DashboardPrintScope) {
  const where = await whereFor(kind, scope);
  const rows = await limitedDbRead(() =>
    prisma.booking.findMany({
      where,
      orderBy:
        kind === "deliveries"
          ? [{ deliveryDate: "asc" }, { deliveryTime: "asc" }, { id: "asc" }]
          : [{ returnDate: "asc" }, { returnTime: "asc" }, { id: "asc" }],
      take: DASHBOARD_PRINT_MAX,
      include: {
        bookingItems: {
          where: { isCancelled: false },
          orderBy: { id: "asc" },
          select: {
            dressName: true,
            category: true,
            size: true,
            price: true,
            fittingCharges: true,
            advance: true,
            remaining: true,
            notes: true,
            itemDeliveryNotes: true,
            itemRemainingCollected: true,
            itemSecurityCollected: true,
            isDelivered: true,
            isReturned: true,
            isIncompleteReturn: true,
            item: { select: { size: true } },
          },
        },
        legacyItem: { select: { category: true, size: true } },
        orders: {
          where: { status: "active" },
          orderBy: [{ deliveryDate: "asc" }, { id: "asc" }],
          select: { description: true, cost: true, advance: true, balance: true, deliveryDate: true, deliveryTime: true },
        },
      },
    }),
  );

  const today = todayIso();
  const records: PrintBookingRecord[] = rows.map((b) => {
    const items = b.bookingItems;
    const remainingCollected = effectiveRemainingCollected(b.remainingCollected, items);
    const securityCollected = effectiveSecurityCollected(b.securityCollected, items, b.securityDeposit);
    const totalRemaining = b.totalRemaining ?? b.remaining ?? 0;
    const dueIso = formatDate(kind === "deliveries" ? b.deliveryDate : b.returnDate, "iso");
    const booked = formatBookingDateTime(b.createdAt);
    const dresses: PrintDressRow[] = items.length
      ? items.map((bi) => ({
          label: dressDisplayName(bi.dressName, bi.category, bookingItemSize(bi)),
          price: bi.price || 0,
          fitting: bi.fittingCharges || 0,
          advance: bi.advance || 0,
          remaining: bi.remaining || 0,
          notes: (bi.notes || "").trim(),
          deliveryNote: (bi.itemDeliveryNotes || "").trim(),
          remainingCollected: bi.itemRemainingCollected || 0,
          securityCollected: bi.itemSecurityCollected || 0,
          status: itemStatus(bi),
        }))
      : b.dressName
        ? [{
            label: dressDisplayName(b.dressName, b.legacyItem?.category, b.legacyItem?.size),
            price: b.price || b.totalPrice || 0,
            fitting: 0,
            advance: b.advance || b.totalAdvance || 0,
            remaining: totalRemaining,
            notes: (b.notes || "").trim(),
            deliveryNote: "",
            remainingCollected: 0,
            securityCollected: 0,
            status: b.status === "delivered" ? "Delivered" : "Pending delivery",
          }]
        : [];

    return {
      id: b.id,
      serial: String(b.monthlySerial).padStart(2, "0"),
      customerName: b.customerName,
      address: b.customerAddress || "",
      contact1: b.contact1 || "",
      contact2: b.contact2 || "",
      whatsapp: b.whatsappNo || "",
      venue: b.venue || "",
      staffNames: b.staffNames || "",
      bookedOn: booked.date ? `${booked.date} ${booked.time}`.trim() : "",
      deliveryDate: formatDate(b.deliveryDate, "display"),
      deliveryTime: b.deliveryTime || "",
      returnDate: formatDate(b.returnDate, "display"),
      returnTime: b.returnTime || "",
      deliveredAt: b.deliveredAt ? formatDate(b.deliveredAt, "display") : "",
      isOverdue: dueIso < today,
      status: b.status,
      commonNotes: (b.commonNotes || "").trim(),
      deliveryNotes: (b.deliveryNotes || "").trim(),
      dresses,
      orders: b.orders.map((o) => ({
        description: o.description,
        cost: o.cost || 0,
        advance: o.advance || 0,
        balance: Math.max(0, o.balance || 0),
        due: `${formatDate(o.deliveryDate, "display")} ${o.deliveryTime || ""}`.trim(),
      })),
      totalRent: b.totalPrice || b.price || 0,
      totalFitting: b.totalFittingCharges || 0,
      totalAdvance: b.totalAdvance ?? b.advance ?? 0,
      advanceMode: b.advancePaymentMode || "",
      totalRemaining,
      remainingCollected,
      remainingMode: b.remainingPaymentMode || "",
      balanceLeft: balanceLeftToCollect(totalRemaining, remainingCollected),
      securityDeposit: b.securityDeposit || 0,
      securityCollected,
      securityMode: b.securityPaymentMode || "",
    };
  });

  return { records, truncated: rows.length >= DASHBOARD_PRINT_MAX };
}
