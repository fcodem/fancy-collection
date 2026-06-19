import { NextRequest, NextResponse } from "next/server";
import prisma from "../prisma";
import bcrypt from "bcryptjs";
import {
  BASE_ACCESSORY,
  BASE_JEWELLERY,
  BASE_MENS,
  BASE_WOMENS,
  SIZES,
  SUB_CATEGORIES,
  localTodayEnd,
  localTodayStart,
  todayIso,
  formatDate,
} from "../constants";

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
    })();
  }
  return initPromise;
}

export async function getOverdueDeliveryCount() {
  const today = localTodayStart();
  return prisma.booking.count({
    where: { deliveryDate: { lt: today }, status: "booked" },
  });
}

export async function getDashboardData() {
  const today = localTodayStart();
  const todayEnd = localTodayEnd();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

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
    overdueList,
  ] = await Promise.all([
    prisma.clothingItem.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.customer.count(),
    prisma.booking.count({ where: { returnDate: { lt: today }, status: "delivered" } }),
    prisma.rental.count({ where: { status: { in: ["active", "overdue"] } } }),
    prisma.rental.count({ where: { status: "active", endDate: { lt: today } } }),
    prisma.payment.aggregate({ _sum: { amount: true }, where: { paidAt: { gte: monthStart } } }),
    prisma.invoice.aggregate({
      _sum: { total: true, amountPaid: true },
      where: { status: { in: ["unpaid", "partial"] } },
    }),
    prisma.booking.findMany({
      where: { deliveryDate: { gte: today, lt: todayEnd } },
      include: { bookingItems: true, legacyItem: true },
      orderBy: { deliveryTime: "asc" },
    }),
    prisma.booking.findMany({
      where: { returnDate: { gte: today, lt: todayEnd }, status: { in: ["booked", "delivered"] } },
      include: { bookingItems: true, legacyItem: true },
      orderBy: { returnTime: "asc" },
    }),
    prisma.booking.findMany({
      where: { deliveryDate: { lte: today }, status: "booked" },
      include: { bookingItems: true, legacyItem: true },
      orderBy: [{ deliveryDate: "asc" }, { deliveryTime: "asc" }],
    }),
    prisma.rental.findMany({
      where: { status: "active", endDate: { lt: today } },
      include: { customer: true },
      orderBy: { endDate: "asc" },
      take: 5,
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
      total_orders: todayDeliveriesList.length,
      delivered: todayDeliveriesList.filter((b) => b.status === "delivered").length,
      remaining_delivery: todayDeliveriesList.filter((b) => b.status === "booked").length,
      returning: todayReturnsList.length,
      all_undelivered: allUndeliveredList.length,
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
      sub_categories: SUB_CATEGORIES,
    },
    today_iso: todayIso(),
    today_display: formatDate(todayIso(), "display"),
  };
}

export function readJsonBody<T = Record<string, unknown>>(req: NextRequest): Promise<T> {
  return req.json() as Promise<T>;
}

export function readFormBody(req: NextRequest): Promise<FormData> {
  return req.formData();
}
