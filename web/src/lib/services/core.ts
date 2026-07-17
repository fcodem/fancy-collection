import { cache } from "react";
import { NextRequest, NextResponse } from "next/server";
import prisma, { todayStartQ, dateQ } from "../prisma";
import {
  whereDeliveryInRange,
  whereReturnBefore,
  whereReturnInRange,
  whereRemainingToDeliver,
  whereOverduePendingDelivery,
} from "../bookingDateQuery";
import { repairAllBookingStatuses } from "./operations";
import bcrypt from "bcryptjs";
import {
  BASE_ACCESSORY,
  BASE_JEWELLERY,
  BASE_MENS,
  BASE_WOMENS,
  SIZES,
  todayIso,
  formatDate,
} from "../constants";
import { getAllSubCategories } from "../subCategories";
import { memoryCachedQuery } from "../perfCache";

const SEED_ITEMS = [
  { name: "Red Bridal Lehenga", sku: "LRG-001", category: "Lehenga", itemType: "clothing", size: "M", color: "Red", dailyRate: 2500, deposit: 10000 },
  { name: "Royal Blue Sherwani", sku: "SHR-001", category: "Sherwani", itemType: "clothing", size: "L", color: "Blue", dailyRate: 1800, deposit: 8000 },
  { name: "Silk Wedding Saree", sku: "SAR-001", category: "Saree", itemType: "clothing", size: "Free Size", color: "Gold", dailyRate: 1200, deposit: 5000 },
  { name: "Black Tuxedo Suit", sku: "SUT-001", category: "Suit", itemType: "clothing", size: "L", color: "Black", dailyRate: 1500, deposit: 6000 },
  { name: "Evening Gown", sku: "GWN-001", category: "Gown", itemType: "clothing", size: "S", color: "Navy", dailyRate: 2000, deposit: 7000 },
];

export async function ensureOwnerExists() {
  // Never auto-create a known default password in production.
  if (process.env.VERCEL === "1" || process.env.NODE_ENV === "production") {
    return;
  }
  const owner = await prisma.user.findUnique({ where: { username: "owner" } });
  if (owner) return;
  const password = process.env.OWNER_SEED_PASSWORD?.trim() || "ChangeMe-LocalOnly-16+";
  if (password.length < 16) return;
  await prisma.user.create({
    data: {
      username: "owner",
      passwordHash: await bcrypt.hash(password, 12),
      role: "owner",
      active: true,
    },
  });
}

export async function seedDatabase() {
  const existing = await prisma.customer.findFirst();
  if (existing) return;

  await prisma.customer.createMany({
    data: [
      { name: "Priya Sharma", phone: "9876543210", email: "priya@email.com", address: "Mumbai" },
      { name: "Rahul Mehta", phone: "9123456780", email: "rahul@email.com", address: "Delhi" },
    ],
  });

  await prisma.clothingItem.createMany({ data: SEED_ITEMS });
}

let initPromise: Promise<void> | null = null;

export async function initDb() {
  if (!initPromise) {
    initPromise = (async () => {
      await ensureOwnerExists();
      await seedDatabase();
      // repairAllBookingStatuses skipped on cold start — run via admin panel if needed
    })();
  }
  return initPromise;
}

export async function getOverdueDeliveryCount() {
  const today = todayIso();
  const where = await whereOverduePendingDelivery(today);
  return prisma.booking.count({ where });
}

const _getDashboardDataRaw = async () => {
  const today = todayStartQ();
  const todayStr = todayIso();
  const now = new Date();
  const monthStart = dateQ(new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)));
  // Orders due within the next 3 days (plus any overdue, uncollected orders).
  const ordersDueEnd = dateQ(
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 4)),
  );

  const [
    deliveryTodayWhere,
    returnTodayWhere,
    undeliveredWhere,
    lateReturnWhere,
  ] = await Promise.all([
    whereDeliveryInRange(todayStr, todayStr),
    whereReturnInRange(todayStr, todayStr),
    whereRemainingToDeliver(todayStr),
    whereReturnBefore(todayStr),
  ]);

  // One parallel batch — fewer round-trips to the pooler.
  const [
    itemStatusCounts,
    totalCustomers,
    lateReturnCount,
    activeRentals,
    overdueRentals,
    monthlyRevenueAgg,
    outstandingAgg,
    todayDeliveryTotal,
    todayDelivered,
    todayRemainingDelivery,
    todayReturning,
    undeliveredCount,
    overdueList,
    subCategories,
    ordersDueSoonList,
  ] = await Promise.all([
    prisma.clothingItem.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.customer.count(),
    prisma.booking.count({ where: { ...lateReturnWhere, status: "delivered" } }),
    prisma.rental.count({ where: { status: { in: ["active", "overdue"] } } }),
    prisma.rental.count({ where: { status: "active", endDate: { lt: today } } }),
    prisma.payment.aggregate({ _sum: { amount: true }, where: { paidAt: { gte: monthStart } } }),
    prisma.invoice.aggregate({
      _sum: { total: true, amountPaid: true },
      where: { status: { in: ["unpaid", "partial"] } },
    }),
    prisma.booking.count({ where: deliveryTodayWhere }),
    prisma.booking.count({ where: { ...deliveryTodayWhere, status: "delivered" } }),
    prisma.booking.count({ where: { ...deliveryTodayWhere, status: "booked" } }),
    prisma.booking.count({
      where: { ...returnTodayWhere, status: { in: ["booked", "delivered"] } },
    }),
    prisma.booking.count({ where: undeliveredWhere }),
    prisma.rental.findMany({
      where: { status: "active", endDate: { lt: today } },
      select: {
        id: true,
        rentalNumber: true,
        endDate: true,
        totalAmount: true,
        status: true,
        customer: { select: { name: true } },
      },
      orderBy: { endDate: "asc" },
      take: 5,
    }),
    getAllSubCategories(),
    prisma.bookingOrder.findMany({
      where: {
        status: "active",
        readyAt: null,
        deliveryDate: { lt: ordersDueEnd },
      },
      orderBy: { deliveryDate: "asc" },
      take: 25,
      include: {
        booking: {
          select: {
            id: true,
            monthlySerial: true,
            publicBookingId: true,
            customerName: true,
            contact1: true,
            whatsappNo: true,
          },
        },
      },
    }),
  ]);

  const statusMap = Object.fromEntries(itemStatusCounts.map((row) => [row.status, row._count._all]));
  const totalItems = itemStatusCounts.reduce((sum, row) => sum + row._count._all, 0);
  const outstanding =
    (outstandingAgg._sum.total || 0) - (outstandingAgg._sum.amountPaid || 0);

  return {
    stats: {
      total_items: totalItems,
      available_items: statusMap.available || 0,
      rented_items: statusMap.rented || 0,
      total_customers: totalCustomers,
      active_rentals: activeRentals,
      overdue_rentals: overdueRentals,
      monthly_revenue: monthlyRevenueAgg._sum.amount || 0,
      outstanding,
    },
    today_stats: {
      total_orders: todayDeliveryTotal,
      delivered: todayDelivered,
      remaining_delivery: todayRemainingDelivery,
      returning: todayReturning,
      all_undelivered: undeliveredCount,
    },
    overdue_list: overdueList,
    late_return_count: lateReturnCount,
    orders_due_soon_list: ordersDueSoonList,
    orders_due_soon_count: ordersDueSoonList.length,
    categories: {
      mens: BASE_MENS,
      womens: BASE_WOMENS,
      jewellery: BASE_JEWELLERY,
      accessory: BASE_ACCESSORY,
      sizes: SIZES,
      sub_categories: subCategories,
    },
    today_iso: todayIso(),
    today_display: formatDate(todayIso(), "display"),
  };
};

const _getDashboardDataDeduped = cache(_getDashboardDataRaw);

/** Cached dashboard payload — in-memory TTL (Next.js data cache rejects entries > 2MB). */
export async function getDashboardData() {
  return memoryCachedQuery(["dashboard-data"], () => _getDashboardDataDeduped(), 90);
}

/** Uncached dashboard payload for live refresh (API + realtime). */
export async function getDashboardDataFresh() {
  return _getDashboardDataRaw();
}

function iso(d: Date | string | null | undefined) {
  if (d == null) return null;
  if (typeof d === "string") return d;
  return d.toISOString();
}

/** JSON-safe dashboard shape for client fetch and RSC props. */
export function serializeDashboardData(raw: Awaited<ReturnType<typeof _getDashboardDataRaw>>) {
  return {
    stats: raw.stats,
    today_stats: raw.today_stats,
    late_return_count: raw.late_return_count,
    orders_due_soon_count: raw.orders_due_soon_count,
    today_iso: raw.today_iso,
    today_display: raw.today_display,
    categories: raw.categories,
    overdue_list: raw.overdue_list.map((r) => ({
      id: r.id,
      rentalNumber: r.rentalNumber,
      endDate: iso(r.endDate),
      totalAmount: r.totalAmount,
      customer: { name: r.customer.name },
    })),
    orders_due_soon_list: raw.orders_due_soon_list.map((o) => ({
      id: o.id,
      description: o.description,
      cost: o.cost,
      advance: o.advance,
      balance: o.balance,
      deliveryDate: iso(o.deliveryDate) ?? o.deliveryDate,
      deliveryTime: o.deliveryTime,
      booking: {
        id: o.booking.id,
        monthlySerial: o.booking.monthlySerial,
        customerName: o.booking.customerName,
        contact1: o.booking.contact1,
      },
    })),
  };
}

export type SerializedDashboardData = ReturnType<typeof serializeDashboardData>;

export function readJsonBody<T = Record<string, unknown>>(req: NextRequest): Promise<T> {
  return req.json() as Promise<T>;
}

export function readFormBody(req: NextRequest): Promise<FormData> {
  return req.formData();
}
