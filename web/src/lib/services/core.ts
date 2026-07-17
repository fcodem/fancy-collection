/**
 * Dashboard data — consolidated SQL round-trips + tagged unstable_cache.
 */
import { cache } from "react";
import { NextRequest } from "next/server";
import prisma, { dateQ } from "../prisma";
import {
  BASE_ACCESSORY,
  BASE_JEWELLERY,
  BASE_MENS,
  BASE_WOMENS,
  SIZES,
  todayIso,
  formatDate,
  monthStartIso,
  localTodayStart,
} from "../constants";
import { getAllSubCategories } from "../subCategories";
import { cachedQuery, memoryCachedQuery } from "../perfCache";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { whereOverduePendingDelivery } from "../bookingDateQuery";


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

type BookingStatsRow = {
  late_return_count: number;
  today_delivery_total: number;
  today_delivered: number;
  today_remaining_delivery: number;
  today_returning: number;
  undelivered_count: number;
};

type BusinessStatsRow = {
  total_items: number;
  available_items: number;
  rented_items: number;
  total_customers: number;
  active_rentals: number;
  overdue_rentals: number;
};

type FinanceStatsRow = {
  monthly_revenue: number;
  outstanding: number;
};

const _getDashboardDataRaw = async () => {
  const t0 = Date.now();
  const today = localTodayStart();
  const todayStr = todayIso();
  const monthStart = dateQ(new Date(`${monthStartIso()}`));
  const ordersDueEnd = dateQ(
    new Date(Date.UTC(
      Number(todayStr.slice(0, 4)),
      Number(todayStr.slice(5, 7)) - 1,
      Number(todayStr.slice(8, 10)) + 4,
    )),
  );

  // Single aggregate round-trip — stays under connection_limit=3 headroom.
  const tAgg = Date.now();
  const dashboardAgg = await prisma.$queryRaw<
    Array<{
      late_return_count: number;
      today_delivery_total: number;
      today_delivered: number;
      today_remaining_delivery: number;
      today_returning: number;
      undelivered_count: number;
      total_items: number;
      available_items: number;
      rented_items: number;
      total_customers: number;
      active_rentals: number;
      overdue_rentals: number;
      monthly_revenue: number;
      outstanding: number;
    }>
  >`
    SELECT
      (
        SELECT COUNT(*)::int FROM bookings
        WHERE status NOT IN ('cancelled', 'postponed')
          AND status = 'delivered'
          AND return_date < ${today}::timestamptz
      ) AS late_return_count,
      (
        SELECT COUNT(*)::int FROM bookings
        WHERE status NOT IN ('cancelled', 'postponed')
          AND delivery_date >= ${today}::timestamptz
          AND delivery_date < (${today}::timestamptz + interval '1 day')
      ) AS today_delivery_total,
      (
        SELECT COUNT(*)::int FROM bookings
        WHERE status NOT IN ('cancelled', 'postponed')
          AND status = 'delivered'
          AND delivery_date >= ${today}::timestamptz
          AND delivery_date < (${today}::timestamptz + interval '1 day')
      ) AS today_delivered,
      (
        SELECT COUNT(*)::int FROM bookings
        WHERE status NOT IN ('cancelled', 'postponed')
          AND status = 'booked'
          AND delivery_date >= ${today}::timestamptz
          AND delivery_date < (${today}::timestamptz + interval '1 day')
      ) AS today_remaining_delivery,
      (
        SELECT COUNT(*)::int FROM bookings
        WHERE status NOT IN ('cancelled', 'postponed')
          AND status IN ('booked', 'delivered')
          AND return_date >= ${today}::timestamptz
          AND return_date < (${today}::timestamptz + interval '1 day')
      ) AS today_returning,
      (
        SELECT COUNT(*)::int FROM bookings
        WHERE status NOT IN ('cancelled', 'postponed')
          AND status = 'booked'
          AND delivery_date < (${today}::timestamptz + interval '1 day')
          AND (
            NOT EXISTS (SELECT 1 FROM booking_items bi WHERE bi.booking_id = bookings.id)
            OR EXISTS (
              SELECT 1 FROM booking_items bi
              WHERE bi.booking_id = bookings.id
                AND bi.is_delivered = false
                AND bi.is_cancelled = false
            )
          )
      ) AS undelivered_count,
      (SELECT COUNT(*)::int FROM clothing_items) AS total_items,
      (SELECT COUNT(*)::int FROM clothing_items WHERE status = 'available') AS available_items,
      (SELECT COUNT(*)::int FROM clothing_items WHERE status = 'rented') AS rented_items,
      (SELECT COUNT(*)::int FROM customers) AS total_customers,
      (SELECT COUNT(*)::int FROM rentals WHERE status IN ('active', 'overdue')) AS active_rentals,
      (SELECT COUNT(*)::int FROM rentals WHERE status = 'active' AND end_date < ${today}::timestamptz) AS overdue_rentals,
      COALESCE((SELECT SUM(amount) FROM payments WHERE paid_at >= ${monthStart}::timestamptz), 0)::float AS monthly_revenue,
      COALESCE((
        SELECT SUM(total - amount_paid) FROM invoices WHERE status IN ('unpaid', 'partial')
      ), 0)::float AS outstanding
  `;
  const bookingStatsMs = Date.now() - tAgg;
  const businessStatsMs = bookingStatsMs;
  const financeStatsMs = bookingStatsMs;
  const agg = dashboardAgg[0];
  const b = {
    late_return_count: agg?.late_return_count ?? 0,
    today_delivery_total: agg?.today_delivery_total ?? 0,
    today_delivered: agg?.today_delivered ?? 0,
    today_remaining_delivery: agg?.today_remaining_delivery ?? 0,
    today_returning: agg?.today_returning ?? 0,
    undelivered_count: agg?.undelivered_count ?? 0,
  };
  const biz = {
    total_items: agg?.total_items ?? 0,
    available_items: agg?.available_items ?? 0,
    rented_items: agg?.rented_items ?? 0,
    total_customers: agg?.total_customers ?? 0,
    active_rentals: agg?.active_rentals ?? 0,
    overdue_rentals: agg?.overdue_rentals ?? 0,
  };
  const fin = {
    monthly_revenue: agg?.monthly_revenue ?? 0,
    outstanding: agg?.outstanding ?? 0,
  };

  // Peak concurrency ≤2 (subcategories are unstable_cache — usually no DB).
  const tLists = Date.now();
  const [overdueList, ordersDueSoonList] = await Promise.all([
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
  // After the two DB list queries — subcats are cached and usually free.
  const subCategories = await getAllSubCategories();
  const listsMs = Date.now() - tLists;
  const totalMs = Date.now() - t0;
  console.log(
    `[perf] dashboard authMs=0 bookingStatsMs=${bookingStatsMs} businessStatsMs=${businessStatsMs} financeStatsMs=${financeStatsMs} listsMs=${listsMs} totalMs=${totalMs}`,
  );

  return {
    stats: {
      total_items: biz.total_items,
      available_items: biz.available_items,
      rented_items: biz.rented_items,
      total_customers: biz.total_customers,
      active_rentals: biz.active_rentals,
      overdue_rentals: biz.overdue_rentals,
      monthly_revenue: Number(fin.monthly_revenue) || 0,
      outstanding: Number(fin.outstanding) || 0,
    },
    today_stats: {
      total_orders: b.today_delivery_total,
      delivered: b.today_delivered,
      remaining_delivery: b.today_remaining_delivery,
      returning: b.today_returning,
      all_undelivered: b.undelivered_count,
    },
    overdue_list: overdueList,
    late_return_count: b.late_return_count,
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

/** Tagged Next.js cache (survives across isolates) + in-process TTL. */
export async function getDashboardData(): Promise<SerializedDashboardData> {
  return cachedQuery(
    ["dashboard-data"],
    async () => {
      const raw = await memoryCachedQuery(
        ["dashboard-data-mem"],
        () => _getDashboardDataDeduped(),
        90,
      );
      return serializeDashboardData(raw);
    },
    60,
  );
}

export async function getDashboardDataFresh(): Promise<SerializedDashboardData> {
  return serializeDashboardData(await _getDashboardDataRaw());
}

export function readJsonBody<T = Record<string, unknown>>(req: NextRequest): Promise<T> {
  return req.json() as Promise<T>;
}

export function readFormBody(req: NextRequest): Promise<FormData> {
  return req.formData();
}

// Keep Prisma import used for typed raw results in some tooling.
void Prisma;
