import prisma, { dateQ } from "@/lib/prisma";
import {
  BASE_ACCESSORY,
  BASE_JEWELLERY,
  BASE_MENS,
  BASE_WOMENS,
  SIZES,
  formatDate,
  localTodayStart,
  monthStartIso,
  todayIso,
} from "@/lib/constants";
import { cachedQuery, memoryCachedQuery } from "@/lib/perfCache";
import { INVENTORY_CACHE_TAGS } from "@/lib/inventoryCacheTags";
import type { Prisma } from "@prisma/client";

const LIST_LIMIT = 10;
const SECTION_TIMEOUT_MS = 1_500;

async function inTimedTransaction<T>(
  work: (tx: Prisma.TransactionClient) => Promise<T>,
  timeoutMs = SECTION_TIMEOUT_MS,
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = '${timeoutMs}ms'`);
      return work(tx);
    },
    { timeout: timeoutMs + 750, maxWait: 750 },
  );
}

export async function getDashboardEssentialData() {
  return cachedQuery(
    [INVENTORY_CACHE_TAGS.dashboardCounts, "essential"],
    () =>
      memoryCachedQuery(
        ["dashboard-essential-mem"],
        async () => {
          const today = localTodayStart();
          const rows = await prisma.$queryRaw<
            Array<{
              totalOrders: number;
              delivered: number;
              remainingToday: number;
              returning: number;
              lateReturns: number;
              allUndelivered: number;
            }>
          >`
            SELECT
              COUNT(*) FILTER (
                WHERE b.status NOT IN ('cancelled', 'postponed')
                  AND b.delivery_date >= ${today}::timestamptz
                  AND b.delivery_date < (${today}::timestamptz + interval '1 day')
              )::int AS "totalOrders",
              COUNT(*) FILTER (
                WHERE b.status = 'delivered'
                  AND b.delivery_date >= ${today}::timestamptz
                  AND b.delivery_date < (${today}::timestamptz + interval '1 day')
              )::int AS delivered,
              COUNT(*) FILTER (
                WHERE b.status = 'booked'
                  AND b.delivery_date >= ${today}::timestamptz
                  AND b.delivery_date < (${today}::timestamptz + interval '1 day')
              )::int AS "remainingToday",
              COUNT(*) FILTER (
                WHERE b.status IN ('booked', 'delivered')
                  AND b.return_date >= ${today}::timestamptz
                  AND b.return_date < (${today}::timestamptz + interval '1 day')
              )::int AS returning,
              COUNT(*) FILTER (
                WHERE b.status = 'delivered' AND b.return_date < ${today}::timestamptz
              )::int AS "lateReturns",
              COUNT(*) FILTER (
                WHERE b.status = 'booked'
                  AND b.delivery_date < (${today}::timestamptz + interval '1 day')
                  AND (
                    NOT EXISTS (
                      SELECT 1 FROM booking_items bi WHERE bi.booking_id = b.id
                    )
                    OR EXISTS (
                      SELECT 1 FROM booking_items bi
                      WHERE bi.booking_id = b.id
                        AND bi.is_delivered = false
                        AND bi.is_cancelled = false
                    )
                  )
              )::int AS "allUndelivered"
            FROM bookings b
          `;
          const r = rows[0];
          const todayString = todayIso();
          return {
            stats: {
              total_items: 0,
              available_items: 0,
              rented_items: 0,
              total_customers: 0,
              active_rentals: 0,
              overdue_rentals: 0,
              monthly_revenue: 0,
              outstanding: 0,
            },
            today_stats: {
              total_orders: r?.totalOrders ?? 0,
              delivered: r?.delivered ?? 0,
              remaining_delivery: r?.remainingToday ?? 0,
              returning: r?.returning ?? 0,
              all_undelivered: r?.allUndelivered ?? 0,
            },
            late_return_count: r?.lateReturns ?? 0,
            orders_due_soon_count: 0,
            today_iso: todayString,
            today_display: formatDate(todayString, "display"),
            categories: {
              mens: BASE_MENS,
              womens: BASE_WOMENS,
              jewellery: BASE_JEWELLERY,
              accessory: BASE_ACCESSORY,
              sizes: SIZES,
              sub_categories: [],
            },
            overdue_list: [],
            orders_due_soon_list: [],
          };
        },
        15,
      ),
    15,
  );
}

export async function getDashboardBusinessSummary() {
  return cachedQuery(
    [INVENTORY_CACHE_TAGS.dashboard, "business-summary"],
    () =>
      memoryCachedQuery(
        ["dashboard-business-summary-mem"],
        async () => {
          const rows = await prisma.$queryRaw<
            Array<{
              totalItems: number;
              availableItems: number;
              rentedItems: number;
              totalCustomers: number;
              activeRentals: number;
            }>
          >`
            SELECT
              (SELECT COUNT(*)::int FROM clothing_items) AS "totalItems",
              (SELECT COUNT(*)::int FROM clothing_items WHERE status = 'available') AS "availableItems",
              (SELECT COUNT(*)::int FROM clothing_items WHERE status = 'rented') AS "rentedItems",
              (SELECT COUNT(*)::int FROM customers) AS "totalCustomers",
              (SELECT COUNT(*)::int FROM rentals WHERE status IN ('active', 'overdue')) AS "activeRentals"
          `;
          return rows[0] ?? {
            totalItems: 0,
            availableItems: 0,
            rentedItems: 0,
            totalCustomers: 0,
            activeRentals: 0,
          };
        },
        25,
      ),
    25,
  );
}

export async function getDashboardFinanceSummary() {
  return cachedQuery(
    [INVENTORY_CACHE_TAGS.dashboard, "finance-summary"],
    () =>
      memoryCachedQuery(
        ["dashboard-finance-summary-mem"],
        async () => {
          const monthStart = dateQ(new Date(monthStartIso()));
          const rows = await prisma.$queryRaw<Array<{ monthlyRevenue: number; outstanding: number }>>`
            SELECT
              COALESCE((SELECT SUM(amount) FROM payments WHERE paid_at >= ${monthStart}::timestamptz), 0)::float AS "monthlyRevenue",
              COALESCE((SELECT SUM(total - amount_paid) FROM invoices WHERE status IN ('unpaid', 'partial')), 0)::float AS outstanding
          `;
          return rows[0] ?? { monthlyRevenue: 0, outstanding: 0 };
        },
        45,
      ),
    45,
  );
}

export async function getDashboardOrdersDueSoon() {
  const today = todayIso();
  const dueEnd = new Date(`${today}T00:00:00.000Z`);
  dueEnd.setUTCDate(dueEnd.getUTCDate() + 4);
  return cachedQuery(
    [INVENTORY_CACHE_TAGS.dashboard, "orders-due-soon", today],
    () =>
      memoryCachedQuery(
        ["dashboard-orders-due-soon-mem", today],
        () =>
          inTimedTransaction((tx) =>
            tx.bookingOrder.findMany({
              where: { status: "active", readyAt: null, deliveryDate: { lt: dueEnd } },
              orderBy: [{ deliveryDate: "asc" }, { id: "asc" }],
              take: LIST_LIMIT,
              select: {
                id: true,
                description: true,
                cost: true,
                advance: true,
                balance: true,
                deliveryDate: true,
                deliveryTime: true,
                booking: {
                  select: {
                    id: true,
                    monthlySerial: true,
                    customerName: true,
                    contact1: true,
                  },
                },
              },
            }),
          ),
        20,
      ),
    20,
  );
}

export async function getDashboardOverdueRentals() {
  const today = localTodayStart();
  return cachedQuery(
    [INVENTORY_CACHE_TAGS.dashboard, "overdue-rentals", todayIso()],
    () =>
      memoryCachedQuery(
        ["dashboard-overdue-rentals-mem", todayIso()],
        () =>
          inTimedTransaction((tx) =>
            tx.rental.findMany({
              where: { status: "active", endDate: { lt: today } },
              orderBy: [{ endDate: "asc" }, { id: "asc" }],
              take: LIST_LIMIT,
              select: {
                id: true,
                rentalNumber: true,
                endDate: true,
                totalAmount: true,
                customer: { select: { name: true } },
              },
            }),
          ),
        20,
      ),
    20,
  );
}

export async function getDashboardReturningToday() {
  const today = localTodayStart();
  return cachedQuery(
    [INVENTORY_CACHE_TAGS.dashboard, "returning-today", todayIso()],
    () =>
      memoryCachedQuery(
        ["dashboard-returning-today-mem", todayIso()],
        () =>
          inTimedTransaction((tx) =>
            tx.booking.findMany({
              where: {
                status: { in: ["booked", "delivered"] },
                returnDate: { gte: today, lt: new Date(today.getTime() + 86_400_000) },
              },
              orderBy: [{ returnTime: "asc" }, { id: "asc" }],
              take: LIST_LIMIT,
              select: {
                id: true,
                monthlySerial: true,
                customerName: true,
                returnTime: true,
              },
            }),
          ),
        20,
      ),
    20,
  );
}

export async function getDashboardAiHealth() {
  return cachedQuery(
    [INVENTORY_CACHE_TAGS.dashboard, "ai-health"],
    () =>
      memoryCachedQuery(
        ["dashboard-ai-health-mem"],
        async () => {
          const rows = await prisma.$queryRaw<Array<{ queued: number; failed: number }>>`
            SELECT
              COUNT(*) FILTER (WHERE status IN ('pending', 'processing'))::int AS queued,
              COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
            FROM inventory_ai_jobs
          `;
          return rows[0] ?? { queued: 0, failed: 0 };
        },
        45,
      ),
    45,
  );
}
