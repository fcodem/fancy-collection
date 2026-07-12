import { Prisma } from "@prisma/client";
import prisma, {
  deliveryRangeFilter,
  isSqliteDb,
  parseDateQ,
} from "./prisma";

/** SQLite stores dates as TEXT ISO (legacy) or INTEGER ms (new rows) — normalize for comparisons. */
function dateColMs(column: string): string {
  return `(CASE typeof(${column}) WHEN 'integer' THEN ${column} ELSE (unixepoch(substr(${column}, 1, 10)) * 1000) END)`;
}

function dateStrMs(dateStr: string): number {
  const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function dateStrMsEndExclusive(dateStr: string): number {
  const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d + 1);
}

async function rawBookingIds(whereSql: string, params: unknown[]): Promise<number[]> {
  const rows = await prisma.$queryRawUnsafe<{ id: number }[]>(
    `SELECT id FROM bookings WHERE ${whereSql}`,
    ...params,
  );
  return rows.map((r) => r.id);
}

export function idsWhere(ids: number[]): Prisma.BookingWhereInput {
  return { id: { in: ids.length ? ids : [-1] } };
}

function intersectIds(...lists: number[][]): number[] {
  if (!lists.length) return [];
  let current = new Set(lists[0]);
  for (let i = 1; i < lists.length; i++) {
    const next = new Set(lists[i]);
    current = new Set([...current].filter((id) => next.has(id)));
  }
  return [...current];
}

async function sqliteDeliveryInRange(fromStr: string, toStr: string): Promise<number[] | null> {
  if (!isSqliteDb()) return null;
  const col = dateColMs("delivery_date");
  return rawBookingIds(`${col} >= ? AND ${col} < ?`, [
    dateStrMs(fromStr),
    dateStrMsEndExclusive(toStr || fromStr),
  ]);
}

async function sqliteDeliveryBefore(fromStr: string): Promise<number[] | null> {
  if (!isSqliteDb()) return null;
  return rawBookingIds(`${dateColMs("delivery_date")} < ?`, [dateStrMs(fromStr)]);
}

async function sqliteDeliveryOnOrBefore(dateStr: string): Promise<number[] | null> {
  if (!isSqliteDb()) return null;
  return rawBookingIds(`${dateColMs("delivery_date")} < ?`, [dateStrMsEndExclusive(dateStr)]);
}

async function sqliteReturnInRange(fromStr: string, toStr: string): Promise<number[] | null> {
  if (!isSqliteDb()) return null;
  const col = dateColMs("return_date");
  return rawBookingIds(`${col} >= ? AND ${col} < ?`, [
    dateStrMs(fromStr),
    dateStrMsEndExclusive(toStr || fromStr),
  ]);
}

async function sqliteReturnBefore(fromStr: string): Promise<number[] | null> {
  if (!isSqliteDb()) return null;
  return rawBookingIds(`${dateColMs("return_date")} < ?`, [dateStrMs(fromStr)]);
}

export async function whereDeliveryInRange(
  fromStr: string,
  toStr: string,
): Promise<Prisma.BookingWhereInput> {
  const ids = await sqliteDeliveryInRange(fromStr, toStr);
  if (ids !== null) return idsWhere(ids);
  return { deliveryDate: deliveryRangeFilter(fromStr, toStr) };
}

/** All bookings whose delivery falls in the same calendar month as `deliveryDate`. */
export async function whereDeliveryInMonth(deliveryDate: Date): Promise<Prisma.BookingWhereInput> {
  return whereDeliveryInRange(
    formatDateForMonth(deliveryDate, "start"),
    formatDateForMonth(deliveryDate, "end"),
  );
}

function formatDateForMonth(d: Date, which: "start" | "end"): string {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  if (which === "start") {
    return `${y}-${String(m + 1).padStart(2, "0")}-01`;
  }
  const last = new Date(Date.UTC(y, m + 1, 0));
  return `${last.getUTCFullYear()}-${String(last.getUTCMonth() + 1).padStart(2, "0")}-${String(last.getUTCDate()).padStart(2, "0")}`;
}

export async function whereDeliveryBefore(fromStr: string): Promise<Prisma.BookingWhereInput> {
  const ids = await sqliteDeliveryBefore(fromStr);
  if (ids !== null) return idsWhere(ids);
  return { deliveryDate: { lt: parseDateQ(fromStr) } };
}

export async function whereDeliveryOnOrBefore(dateStr: string): Promise<Prisma.BookingWhereInput> {
  const ids = await sqliteDeliveryOnOrBefore(dateStr);
  if (ids !== null) return idsWhere(ids);
  const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
  return { deliveryDate: { lt: new Date(Date.UTC(y, m - 1, d + 1)) } };
}

export async function whereReturnInRange(
  fromStr: string,
  toStr: string,
): Promise<Prisma.BookingWhereInput> {
  const ids = await sqliteReturnInRange(fromStr, toStr);
  if (ids !== null) return idsWhere(ids);
  const to = toStr || fromStr;
  const [y, m, d] = to.slice(0, 10).split("-").map(Number);
  return { returnDate: { gte: parseDateQ(fromStr), lt: new Date(Date.UTC(y, m - 1, d + 1)) } };
}

export async function whereReturnBefore(fromStr: string): Promise<Prisma.BookingWhereInput> {
  const ids = await sqliteReturnBefore(fromStr);
  if (ids !== null) return idsWhere(ids);
  return { returnDate: { lt: parseDateQ(fromStr) } };
}

/** Bookings overlapping [deliveryFrom, returnTo] (inclusive calendar days). */
export async function sqliteBookingIdsOverlappingPeriod(
  deliveryFromStr: string,
  returnToStr: string,
): Promise<number[] | null> {
  if (!isSqliteDb()) return null;
  return rawBookingIds(`${dateColMs("delivery_date")} < ? AND ${dateColMs("return_date")} >= ?`, [
    dateStrMsEndExclusive(returnToStr),
    dateStrMs(deliveryFromStr),
  ]);
}

export async function whereBookingOverlapsPeriod(
  deliveryFromStr: string,
  returnToStr: string,
): Promise<Prisma.BookingWhereInput> {
  const ids = await sqliteBookingIdsOverlappingPeriod(deliveryFromStr, returnToStr);
  if (ids !== null) return idsWhere(ids);
  const dDate = parseDateQ(deliveryFromStr);
  const [y, m, d] = returnToStr.slice(0, 10).split("-").map(Number);
  return {
    deliveryDate: { lt: new Date(Date.UTC(y, m - 1, d + 1)) },
    returnDate: { gte: dDate },
  };
}
/** Still booked but not fully delivered at item level (legacy rows with no items stay until status changes). */
export const pendingDeliveryItemsFilter: Prisma.BookingWhereInput = {
  OR: [
    { bookingItems: { none: {} } },
    { bookingItems: { some: { isDelivered: false, isCancelled: false } } },
  ],
};

/** Pickup on/before date, status booked, at least one dress not yet delivered. */
export async function whereRemainingToDeliver(todayStr: string): Promise<Prisma.BookingWhereInput> {
  const dateWhere = await whereDeliveryOnOrBefore(todayStr);
  return {
    ...dateWhere,
    status: "booked" as const,
    ...pendingDeliveryItemsFilter,
  };
}

/** Pickup before today, still pending delivery. */
export async function whereOverduePendingDelivery(todayStr: string): Promise<Prisma.BookingWhereInput> {
  return {
    ...(await whereDeliveryBefore(todayStr)),
    status: "booked",
    ...pendingDeliveryItemsFilter,
  };
}
/** Return on any of the given calendar days (SQLite-safe). */
export async function whereReturnOnAnyDates(dateStrs: string[]): Promise<Prisma.BookingWhereInput> {
  const unique = [...new Set(dateStrs.map((d) => d.slice(0, 10)).filter(Boolean))];
  if (!unique.length) return idsWhere([-1]);
  if (!isSqliteDb()) {
    return {
      OR: unique.map((d) => {
        const [y, m, day] = d.split("-").map(Number);
        return {
          returnDate: { gte: parseDateQ(d), lt: new Date(Date.UTC(y, m - 1, day + 1)) },
        };
      }),
    };
  }
  const col = dateColMs("return_date");
  const clauses = unique.map(() => `(${col} >= ? AND ${col} < ?)`).join(" OR ");
  const params = unique.flatMap((d) => [dateStrMs(d), dateStrMsEndExclusive(d)]);
  const ids = await rawBookingIds(`(${clauses})`, params);
  return idsWhere(ids);
}

/** Delivery on any of the given calendar days (SQLite-safe). */
export async function whereDeliveryOnAnyDates(dateStrs: string[]): Promise<Prisma.BookingWhereInput> {
  const unique = [...new Set(dateStrs.map((d) => d.slice(0, 10)).filter(Boolean))];
  if (!unique.length) return idsWhere([-1]);
  if (!isSqliteDb()) {
    return {
      OR: unique.map((d) => {
        const [y, m, day] = d.split("-").map(Number);
        return {
          deliveryDate: { gte: parseDateQ(d), lt: new Date(Date.UTC(y, m - 1, day + 1)) },
        };
      }),
    };
  }
  const col = dateColMs("delivery_date");
  const clauses = unique.map(() => `(${col} >= ? AND ${col} < ?)`).join(" OR ");
  const params = unique.flatMap((d) => [dateStrMs(d), dateStrMsEndExclusive(d)]);
  const ids = await rawBookingIds(`(${clauses})`, params);
  return idsWhere(ids);
}
/** Delivered before `fromStr`, returning during [fromStr, toStr]. */
export async function whereUnavailableDuringPeriod(
  fromStr: string,
  toStr: string,
): Promise<Prisma.BookingWhereInput> {
  const beforeIds = await sqliteDeliveryBefore(fromStr);
  const returnIds = await sqliteReturnInRange(fromStr, toStr);
  if (beforeIds !== null && returnIds !== null) {
    return idsWhere(intersectIds(beforeIds, returnIds));
  }
  const { gte, lt } = deliveryRangeFilter(fromStr, toStr);
  return { deliveryDate: { lt: gte }, returnDate: { gte, lt } };
}
