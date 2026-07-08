import prisma, { dateQ, parseDateQ } from "../prisma";
import { activeBookingWhere } from "@/lib/bookingActiveStatus";
import { parseDate } from "../constants";
import { logActivity } from "../activityLog";
import { getRefundsBetween, totalRefundAmount } from "../financeRefunds";
import {
  bookingAdvanceAmount,
  totalBalanceReceivedFromDeliveries,
  totalBalanceReceivedAtReturn,
  getPostponedAdvanceBetween,
  totalOrderAdvance,
  getOrderBalanceCollectedBetween,
  getOrderRefundsBetween,
} from "../financeBookingAmounts";
import { cachedQuery } from "../perfCache";

export const EXPENSE_CATEGORIES = [
  "Staff",
  "Rent",
  "Utilities",
  "Supplies",
  "Transport",
  "Miscellaneous",
];

export const EXPENSE_PAYMENT_MODES = ["cash", "upi", "bank", "card"];

const saleBookingInclude = {
  bookingItems: {
    select: { advance: true, remaining: true, itemRemainingCollected: true },
  },
  orders: {
    select: {
      cost: true,
      advance: true,
      advancePaymentMode: true,
      balance: true,
      balanceCollected: true,
      collectPaymentMode: true,
      status: true,
      refundAmount: true,
    },
  },
} as const;

function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function endOfDay(d: Date): Date {
  const s = startOfDay(d);
  s.setUTCDate(s.getUTCDate() + 1);
  return s;
}

function rangeFromStrings(fromStr: string, toStr: string): { start: Date; end: Date } {
  return {
    start: dateQ(startOfDay(parseDate(fromStr))),
    end: dateQ(endOfDay(parseDate(toStr))),
  };
}

function monthRange(monthStr: string): { start: Date; end: Date } {
  const [year, month] = monthStr.split("-").map(Number);
  return {
    start: dateQ(new Date(Date.UTC(year, month - 1, 1))),
    end: dateQ(new Date(Date.UTC(year, month, 1))),
  };
}

export type SaleBreakdown = {
  booking_advance: number;
  balance_at_delivery: number;
  balance_at_return: number;
  balance_received: number;
  order_advance: number;
  order_balance_collected: number;
  order_refund: number;
  orders_received: number;
  cancelled_amount: number;
  postponed_amount: number;
  total_sale: number;
  booking_count: number;
};

/**
 * Total Sale for a date range, computed dynamically from existing records:
 *   Total Sale = Booking Advance + Balance Received + Orders Received
 *              − Booking Cancelled Amount − Postponement Amount
 */
async function computeSaleForRange(rangeStart: Date, rangeEnd: Date): Promise<SaleBreakdown> {
  const [bookings, delivered, returned, refunds, order_balance_collected, order_refund, postponed_amount] =
    await Promise.all([
      prisma.booking.findMany({
        where: { ...activeBookingWhere(), createdAt: { gte: rangeStart, lt: rangeEnd } },
        include: saleBookingInclude,
      }),
      prisma.booking.findMany({
        where: {
          status: { in: ["delivered", "returned"] },
          OR: [
            { deliveredAt: { gte: rangeStart, lt: rangeEnd } },
            { deliveredAt: null, deliveryDate: { gte: rangeStart, lt: rangeEnd } },
          ],
        },
        include: saleBookingInclude,
      }),
      prisma.booking.findMany({
        where: { status: "returned", returnedAt: { gte: rangeStart, lt: rangeEnd } },
        include: saleBookingInclude,
      }),
      getRefundsBetween(rangeStart, rangeEnd),
      getOrderBalanceCollectedBetween(rangeStart, rangeEnd),
      getOrderRefundsBetween(rangeStart, rangeEnd),
      getPostponedAdvanceBetween(rangeStart, rangeEnd),
    ]);

  const booking_advance = bookings.reduce((s, b) => s + bookingAdvanceAmount(b), 0);
  const order_advance = totalOrderAdvance(bookings);
  const balance_at_delivery = totalBalanceReceivedFromDeliveries(delivered);
  const balance_at_return = totalBalanceReceivedAtReturn(returned);
  const balance_received = balance_at_delivery + balance_at_return;
  const orders_received = order_advance + order_balance_collected - order_refund;
  const cancelled_amount = totalRefundAmount(refunds);
  const total_sale =
    booking_advance + balance_received + orders_received - cancelled_amount - postponed_amount;

  return {
    booking_advance,
    balance_at_delivery,
    balance_at_return,
    balance_received,
    order_advance,
    order_balance_collected,
    order_refund,
    orders_received,
    cancelled_amount,
    postponed_amount,
    total_sale,
    booking_count: bookings.length,
  };
}

export type ExpenseRow = {
  id: number;
  date: string;
  category: string;
  amount: number;
  payment_mode: string;
  notes: string;
  created_by: string;
  created_at: string;
};

export type ExpenseSummary = {
  entries: ExpenseRow[];
  total: number;
  by_category: Record<string, number>;
  by_payment_mode: Record<string, number>;
  count: number;
};

async function getExpensesForRange(rangeStart: Date, rangeEnd: Date): Promise<ExpenseSummary> {
  const records = await prisma.ledgerExpense.findMany({
    where: { date: { gte: rangeStart, lt: rangeEnd } },
    orderBy: [{ date: "desc" }, { id: "desc" }],
  });

  const by_category: Record<string, number> = {};
  const by_payment_mode: Record<string, number> = {};
  let total = 0;

  const entries: ExpenseRow[] = records.map((r) => {
    total += r.amount;
    by_category[r.category] = (by_category[r.category] || 0) + r.amount;
    by_payment_mode[r.paymentMode] = (by_payment_mode[r.paymentMode] || 0) + r.amount;
    return {
      id: r.id,
      date: r.date.toISOString().slice(0, 10),
      category: r.category,
      amount: r.amount,
      payment_mode: r.paymentMode,
      notes: r.notes || "",
      created_by: r.createdBy || "",
      created_at: r.createdAt.toISOString(),
    };
  });

  return { entries, total, by_category, by_payment_mode, count: entries.length };
}

export type LedgerSummary = {
  from: string;
  to: string;
  sale: SaleBreakdown;
  expenses: ExpenseSummary;
  total_sale: number;
  total_expense: number;
  net_savings: number;
};

async function buildLedgerSummary(fromStr: string, toStr: string): Promise<LedgerSummary> {
  const { start, end } = rangeFromStrings(fromStr, toStr);
  const [sale, expenses] = await Promise.all([
    computeSaleForRange(start, end),
    getExpensesForRange(start, end),
  ]);
  return {
    from: fromStr,
    to: toStr,
    sale,
    expenses,
    total_sale: sale.total_sale,
    total_expense: expenses.total,
    net_savings: sale.total_sale - expenses.total,
  };
}

export type LedgerTrendPoint = {
  month: string;
  label: string;
  sale: number;
  expense: number;
  savings: number;
};

/** Sale vs expense vs savings for the last `months` calendar months, ending at `monthStr`. */
async function buildLedgerTrend(monthStr: string, months: number): Promise<LedgerTrendPoint[]> {
  const [year, month] = monthStr.split("-").map(Number);
  const points: LedgerTrendPoint[] = [];

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(year, month - 1 - i, 1));
    const mKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const { start, end } = monthRange(mKey);
    const [sale, expenses] = await Promise.all([
      computeSaleForRange(start, end),
      getExpensesForRange(start, end),
    ]);
    points.push({
      month: mKey,
      label: d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
      sale: sale.total_sale,
      expense: expenses.total,
      savings: sale.total_sale - expenses.total,
    });
  }
  return points;
}

export function getLedgerSummary(fromStr: string, toStr: string) {
  return cachedQuery(
    ["finance-ledger", "v1", fromStr, toStr],
    () => buildLedgerSummary(fromStr, toStr),
    30,
  );
}

export function getLedgerTrend(monthStr: string, months = 6) {
  return cachedQuery(
    ["finance-ledger-trend", "v1", monthStr, String(months)],
    () => buildLedgerTrend(monthStr, months),
    60,
  );
}

export async function addExpense(
  data: { date: string; category: string; amount: number; paymentMode?: string; notes?: string },
  by?: string,
) {
  const category = data.category?.trim();
  const amount = Number(data.amount);
  if (!category) throw new Error("Expense category is required.");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a valid amount.");
  if (!data.date) throw new Error("Date is required.");

  const paymentMode = (data.paymentMode || "cash").trim().toLowerCase();
  const entry = await prisma.ledgerExpense.create({
    data: {
      date: parseDateQ(data.date),
      category,
      amount,
      paymentMode,
      notes: data.notes?.trim() || null,
      createdBy: by || null,
    },
  });

  logActivity({
    username: by || "system",
    action: "expense",
    entity: "ledger_expense",
    entityId: entry.id,
    label: `Logged expense ₹${amount} (${category}) on ${data.date.slice(0, 10)}`,
    after: { date: data.date.slice(0, 10), category, amount, payment_mode: paymentMode, notes: data.notes || "" },
  });

  return entry;
}

export async function updateExpense(
  id: number,
  data: { date?: string; category?: string; amount?: number; paymentMode?: string; notes?: string },
  by?: string,
) {
  const existing = await prisma.ledgerExpense.findUnique({ where: { id } });
  if (!existing) throw new Error("Expense entry not found.");

  const category = data.category?.trim() ?? existing.category;
  const amount = data.amount != null ? Number(data.amount) : existing.amount;
  if (!category) throw new Error("Expense category is required.");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a valid amount.");

  const entry = await prisma.ledgerExpense.update({
    where: { id },
    data: {
      date: data.date ? parseDateQ(data.date) : existing.date,
      category,
      amount,
      paymentMode: data.paymentMode ? data.paymentMode.trim().toLowerCase() : existing.paymentMode,
      notes: data.notes !== undefined ? data.notes.trim() || null : existing.notes,
    },
  });

  logActivity({
    username: by || "system",
    action: "expense",
    entity: "ledger_expense",
    entityId: id,
    label: `Updated expense #${id} (${category})`,
    before: { category: existing.category, amount: existing.amount },
    after: { category, amount, payment_mode: entry.paymentMode },
  });

  return entry;
}

export async function deleteExpense(id: number, by?: string) {
  const existing = await prisma.ledgerExpense.findUnique({ where: { id } });
  if (!existing) throw new Error("Expense entry not found.");

  await prisma.ledgerExpense.delete({ where: { id } });

  logActivity({
    username: by || "system",
    action: "expense",
    entity: "ledger_expense",
    entityId: id,
    label: `Removed expense ₹${existing.amount} (${existing.category})`,
    before: {
      date: existing.date.toISOString().slice(0, 10),
      category: existing.category,
      amount: existing.amount,
    },
  });
}
