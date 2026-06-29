import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
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

const SEED_ITEMS = [
  { name: "Red Bridal Lehenga", sku: "LRG-001", category: "Lehenga", itemType: "clothing", size: "M", color: "Red", dailyRate: 2500, deposit: 10000 },
  { name: "Royal Blue Sherwani", sku: "SHR-001", category: "Sherwani", itemType: "clothing", size: "L", color: "Blue", dailyRate: 1800, deposit: 8000 },
  { name: "Silk Wedding Saree", sku: "SAR-001", category: "Saree", itemType: "clothing", size: "Free Size", color: "Gold", dailyRate: 1200, deposit: 5000 },
  { name: "Black Tuxedo Suit", sku: "SUT-001", category: "Suit", itemType: "clothing", size: "L", color: "Black", dailyRate: 1500, deposit: 6000 },
  { name: "Evening Gown", sku: "GWN-001", category: "Gown", itemType: "clothing", size: "S", color: "Navy", dailyRate: 2000, deposit: 7000 },
];

export async function ensureOwnerExists() {
  const owner = await prisma.user.findUnique({ where: { username: "owner" } });
  if (!owner) {
    await prisma.user.create({
      data: {
        username: "owner",
        passwordHash: await bcrypt.hash("admin123", 10),
        role: "owner",
        active: true,
      },
    });
  }
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

  const [
    itemStatusCounts,
    totalCustomers,
    lateReturnCount,
    activeRentals,
    overdueRentals,
    monthlyRevenueAgg,
    outstandingAgg,
    todayDeliveriesList,
    todayReturnsList,
    allUndeliveredList,
    undeliveredCount,
    overdueList,
    subCategories,
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
    prisma.booking.findMany({
      where: deliveryTodayWhere,
      include: { bookingItems: true, legacyItem: true },
      orderBy: { deliveryTime: "asc" },
    }),
    prisma.booking.findMany({
      where: { ...returnTodayWhere, status: { in: ["booked", "delivered"] } },
      include: { bookingItems: true, legacyItem: true },
      orderBy: { returnTime: "asc" },
    }),
    prisma.booking.findMany({
      where: undeliveredWhere,
      include: { bookingItems: true, legacyItem: true },
      orderBy: [{ deliveryDate: "asc" }, { deliveryTime: "asc" }],
      take: 200,
    }),
    prisma.booking.count({ where: undeliveredWhere }),
    prisma.rental.findMany({
      where: { status: "active", endDate: { lt: today } },
      include: { customer: true },
      orderBy: { endDate: "asc" },
      take: 5,
    }),
    getAllSubCategories(),
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
      total_orders: todayDeliveriesList.length,
      delivered: todayDeliveriesList.filter((b) => b.status === "delivered").length,
      remaining_delivery: todayDeliveriesList.filter((b) => b.status === "booked").length,
      returning: todayReturnsList.length,
      all_undelivered: undeliveredCount,
    },
    today_deliveries_list: todayDeliveriesList,
    today_returns_list: todayReturnsList,
    all_undelivered_list: allUndeliveredList,
    overdue_list: overdueList,
    late_return_count: lateReturnCount,
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

export const getDashboardData = unstable_cache(
  _getDashboardDataRaw,
  ["dashboard-data"],
  { revalidate: 60, tags: ["dashboard-data"] },
);

/** Uncached dashboard payload for live refresh (API + realtime). */
export async function getDashboardDataFresh() {
  return _getDashboardDataRaw();
}

function iso(d: Date | string | null | undefined) {
  if (d == null) return null;
  if (typeof d === "string") return d;
  return d.toISOString();
}

/** JSON-safe dashboard shape for client fetch. */
export function serializeDashboardData(raw: Awaited<ReturnType<typeof _getDashboardDataRaw>>) {
  const booking = (b: (typeof raw.today_deliveries_list)[number]) => ({
    ...b,
    deliveryDate: iso(b.deliveryDate) ?? b.deliveryDate,
    returnDate: iso(b.returnDate) ?? b.returnDate,
    deliveredAt: iso(b.deliveredAt),
    returnedAt: iso(b.returnedAt),
    refundedAt: iso(b.refundedAt),
    createdAt: iso(b.createdAt) ?? b.createdAt,
  });
  return {
    ...raw,
    today_deliveries_list: raw.today_deliveries_list.map(booking),
    today_returns_list: raw.today_returns_list.map(booking),
    all_undelivered_list: raw.all_undelivered_list.map(booking),
    overdue_list: raw.overdue_list.map((r) => ({
      ...r,
      startDate: iso(r.startDate),
      endDate: iso(r.endDate),
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
