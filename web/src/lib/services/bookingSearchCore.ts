import prisma, { parseDateQ, startOfMonthQ, endOfMonthQ, dateQ } from "@/lib/prisma";
import { whereDeliveryInRange } from "@/lib/bookingDateQuery";
import {
  parseDate,
  todayIso,
} from "@/lib/constants";
import { serializeBookingForList } from "@/lib/booking";
import type { Booking, BookingItem, ClothingItem, Prisma } from "@prisma/client";

export type BookingWithItems = Booking & {
  bookingItems: (BookingItem & { item?: ClothingItem | null })[];
  legacyItem?: ClothingItem | null;
};

export type SearchMode = "serial" | "customer" | "phone" | "dress" | "mixed" | "year" | "month" | "date";

const bookingInclude = {
  bookingItems: { include: { item: true } },
  legacyItem: true,
} as const;

export function words(q: string) {
  return q.trim().split(/\s+/).filter(Boolean);
}

export function digitsOnly(q: string) {
  return q.replace(/\D/g, "");
}

export function relevanceScore(b: Booking, refDate?: Date) {
  const refMs = (refDate || parseDate(todayIso())).getTime();
  const del = Math.abs(b.deliveryDate.getTime() - refMs);
  const ret = Math.abs(b.returnDate.getTime() - refMs);
  return Math.min(del, ret);
}

export function sortByRelevance(list: BookingWithItems[], refDate?: Date) {
  return [...list].sort((a, b) => relevanceScore(a, refDate) - relevanceScore(b, refDate));
}

export function dedupeById(list: BookingWithItems[]) {
  const seen = new Set<number>();
  return list.filter((b) => {
    if (seen.has(b.id)) return false;
    seen.add(b.id);
    return true;
  });
}

export function customerNameWhere(q: string): Prisma.BookingWhereInput {
  const ws = words(q);
  if (!ws.length) return {};
  return {
    AND: ws.map((w) => ({
      customerName: { contains: w, mode: "insensitive" as const },
    })),
  };
}

export function dressNameWhere(q: string): Prisma.BookingWhereInput {
  const ws = words(q);
  if (!ws.length) return {};
  return {
    AND: ws.map((w) => ({
      OR: [
        { dressName: { contains: w, mode: "insensitive" as const } },
        { bookingItems: { some: { dressName: { contains: w, mode: "insensitive" as const } } } },
        { legacyItem: { is: { sku: { contains: w, mode: "insensitive" as const } } } },
        {
          bookingItems: {
            some: { item: { is: { sku: { contains: w, mode: "insensitive" as const } } } },
          },
        },
      ],
    })),
  };
}

export function phoneWhere(q: string): Prisma.BookingWhereInput {
  const d = digitsOnly(q);
  if (!d) return {};
  return {
    OR: [
      { contact1: { contains: d, mode: "insensitive" as const } },
      { whatsappNo: { contains: d, mode: "insensitive" as const } },
    ],
  };
}

export function yearDeliveryWhere(refDate: Date): Prisma.BookingWhereInput {
  const yearStart = dateQ(new Date(Date.UTC(refDate.getUTCFullYear(), 0, 1)));
  const yearEnd = dateQ(new Date(Date.UTC(refDate.getUTCFullYear() + 1, 0, 1)));
  return { deliveryDate: { gte: yearStart, lt: yearEnd } };
}

export function categoryWhere(category: string): Prisma.BookingWhereInput {
  if (!category) return {};
  return {
    OR: [
      { bookingItems: { some: { category } } },
      { legacyItem: { is: { category } } },
    ],
  };
}

function monthRangeFromRefDate(refDate: Date) {
  const y = refDate.getUTCFullYear();
  const m = refDate.getUTCMonth();
  const fromStr = `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const toStr = `${y}-${String(m + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { y, m, fromStr, toStr, monthKey: fromStr.slice(0, 7) };
}

async function monthDeliveryWhereFromRefDate(refDate: Date) {
  const { fromStr, toStr } = monthRangeFromRefDate(refDate);
  return whereDeliveryInRange(fromStr, toStr);
}

export async function fetchBookings(
  where: Prisma.BookingWhereInput,
  orderBy?: Prisma.BookingOrderByWithRelationInput | Prisma.BookingOrderByWithRelationInput[],
  take?: number,
) {
  return prisma.booking.findMany({
    where: { status: { not: "cancelled" }, ...where },
    include: bookingInclude,
    ...(orderBy ? { orderBy } : {}),
    ...(take ? { take } : {}),
  });
}

/** Dashboard: serial in prev / current / next month (SQLite-safe). */
export async function searchBySerialMonths(serial: number, refDate: Date) {
  const prevAnchor = new Date(Date.UTC(
    refDate.getUTCFullYear(), refDate.getUTCMonth() - 1, 15
  ));
  const nextAnchor = new Date(Date.UTC(
    refDate.getUTCFullYear(), refDate.getUTCMonth() + 1, 15
  ));
  const rangeStart = startOfMonthQ(prevAnchor);
  const rangeEnd   = endOfMonthQ(nextAnchor);

  const rows = await fetchBookings({
    monthlySerial: serial,
    deliveryDate: { gte: rangeStart, lt: rangeEnd },
  });
  return dedupeById(rows).sort(
    (a, b) => a.deliveryDate.getTime() - b.deliveryDate.getTime()
  );
}

/** Universal: serial anywhere in reference year (SQLite-safe). */
export async function searchBySerialInYear(serial: number, refDate: Date) {
  const y = refDate.getUTCFullYear();
  const yearWhere = await whereDeliveryInRange(`${y}-01-01`, `${y}-12-31`);
  const rows = await fetchBookings({
    monthlySerial: serial,
    ...yearWhere,
  });
  return sortByRelevance(rows, refDate);
}

const DASHBOARD_ACTIVE_STATUSES = ["booked", "delivered"] as const;

function isDashboardActive(b: Pick<Booking, "status">) {
  return DASHBOARD_ACTIVE_STATUSES.includes(b.status as (typeof DASHBOARD_ACTIVE_STATUSES)[number]);
}

function filterDashboardActive(rows: BookingWithItems[]) {
  return rows.filter(isDashboardActive);
}

function dashboardResults(rows: BookingWithItems[], mode: SearchMode) {
  return {
    mode,
    results: filterDashboardActive(rows).map(serializeBookingForList),
  };
}

/** Dashboard serial — direct match first, then month/year windows (active only). */
async function searchDashboardBySerial(serial: number, refDate: Date) {
  let results: BookingWithItems[] = await fetchBookings({
    monthlySerial: serial,
    status: { in: [...DASHBOARD_ACTIVE_STATUSES] },
  });

  if (!results.length) {
    results = filterDashboardActive(await searchBySerialMonths(serial, refDate));
  }
  if (!results.length) {
    results = filterDashboardActive(await searchBySerialInYear(serial, refDate));
  }

  return dedupeById(results).sort((a, b) => a.deliveryDate.getTime() - b.deliveryDate.getTime());
}

export async function dashboardSearchBookings(queryText: string, refDateStr?: string) {
  const q = queryText.trim();
  const isSerialQuery = /^\d+$/.test(q);
  if (!q || (!isSerialQuery && q.length < 2)) {
    return { mode: "mixed" as SearchMode, results: [] };
  }

  const refDate = parseDate(refDateStr || todayIso());

  if (isSerialQuery) {
    let results: BookingWithItems[] = [];
    if (q.length <= 3) {
      const serial = parseInt(q, 10);
      if (!Number.isNaN(serial)) {
        results = await searchDashboardBySerial(serial, refDate);
      }
    } else {
      const serialFromPrefix = parseInt(q.slice(0, 3), 10);
      if (!Number.isNaN(serialFromPrefix)) {
        results = await searchDashboardBySerial(serialFromPrefix, refDate);
      }
      const phoneRows = await fetchBookings({
        ...phoneWhere(q),
        status: { in: [...DASHBOARD_ACTIVE_STATUSES] },
      });
      results = dedupeById([...results, ...sortByRelevance(phoneRows, refDate)]);
    }
    return dashboardResults(results, q.length <= 3 ? "serial" : "mixed");
  }

  if (digitsOnly(q).length >= 10) {
    const rows = await fetchBookings({
      ...phoneWhere(q),
      status: { in: [...DASHBOARD_ACTIVE_STATUSES] },
    });
    return dashboardResults(rows, "phone");
  }

  const customerHits = await fetchBookings({
    ...customerNameWhere(q),
    status: { in: [...DASHBOARD_ACTIVE_STATUSES] },
  });
  if (customerHits.length) {
    return dashboardResults(sortByRelevance(customerHits, refDate), "customer");
  }

  const dressRows = await fetchBookings({
    ...dressNameWhere(q),
    status: { in: [...DASHBOARD_ACTIVE_STATUSES] },
  });
  return dashboardResults(sortByRelevance(dressRows, refDate), "dress");
}

/** All Record / Advanced Search — full history in year; customer name = lifetime. */
export async function universalSearchBookings(queryText: string, refDateStr?: string, category = "") {
  const q = queryText.trim();
  const refDate = parseDate(refDateStr || todayIso());
  const yearFilter = yearDeliveryWhere(refDate);
  const catFilter = categoryWhere(category);

  if (!q) {
    const rows = await fetchBookings({ ...yearFilter, ...catFilter }, { deliveryDate: "desc" }, 150);
    return { mode: "year" as SearchMode, results: rows.map(serializeBookingForList) };
  }

  if (q.length < 2) {
    return { mode: "year" as SearchMode, results: [] };
  }

  if (/^\d+$/.test(q)) {
    const serialFromPrefix = parseInt(q.slice(0, 3), 10);
    let results: BookingWithItems[] = [];
    if (!Number.isNaN(serialFromPrefix)) {
      results = await searchBySerialInYear(serialFromPrefix, refDate);
      if (category) results = results.filter((b) => matchesCategory(b, category));
    }
    if (q.length > 3) {
      const phoneRows = await fetchBookings({ ...phoneWhere(q), ...yearFilter, ...catFilter }, undefined, 200);
      results = dedupeById([...results, ...sortByRelevance(phoneRows)]);
    }
    return {
      mode: q.length <= 3 ? ("serial" as const) : ("mixed" as const),
      results: results.map(serializeBookingForList),
    };
  }

  if (digitsOnly(q).length >= 10) {
    const rows = await fetchBookings({ ...phoneWhere(q), ...yearFilter, ...catFilter }, undefined, 200);
    return { mode: "phone", results: sortByRelevance(rows).map(serializeBookingForList) };
  }

  const customerRows = await fetchBookings({ ...customerNameWhere(q), ...catFilter }, undefined, 200);
  if (customerRows.length) {
    return {
      mode: "customer",
      results: sortByRelevance(customerRows).map(serializeBookingForList),
    };
  }

  const dressRows = await fetchBookings({ ...dressNameWhere(q), ...yearFilter, ...catFilter }, undefined, 200);
  return { mode: "dress", results: sortByRelevance(dressRows).map(serializeBookingForList) };
}

function matchesCategory(b: BookingWithItems, category: string) {
  if (!category) return true;
  if (b.bookingItems?.some((bi) => bi.category === category)) return true;
  return b.legacyItem?.category === category;
}

function activeBookingWhere(category: string): Prisma.BookingWhereInput {
  return {
    status: { in: ["booked", "delivered"] },
    ...categoryWhere(category),
  };
}

async function bookingsInMonth(y: number, m: number, category: string): Promise<BookingWithItems[]> {
  const anchor = new Date(Date.UTC(y, m, 15));
  const monthWhere = await monthDeliveryWhereFromRefDate(anchor);
  return fetchBookings(
    {
      ...monthWhere,
      ...activeBookingWhere(category),
    },
    [{ deliveryDate: "asc" }, { monthlySerial: "asc" }],
  );
}

/** Strict text match — only rows that match the search term. */
async function matchBookingsByQuery(
  q: string,
  category: string,
): Promise<{ rows: BookingWithItems[]; mode: SearchMode }> {
  const base = activeBookingWhere(category);

  if (/^\d+$/.test(q)) {
    const serial = parseInt(q.slice(0, 3), 10);
    let results: BookingWithItems[] = [];
    if (!Number.isNaN(serial)) {
      results = await fetchBookings({ ...base, monthlySerial: serial });
    }
    if (q.length > 3) {
      const phoneRows = await fetchBookings({ ...base, ...phoneWhere(q) });
      results = dedupeById([...results, ...phoneRows]);
    }
    return { rows: results, mode: q.length <= 3 ? "serial" : "mixed" };
  }

  if (digitsOnly(q).length >= 10) {
    const rows = await fetchBookings({ ...base, ...phoneWhere(q) });
    return { rows, mode: "phone" };
  }

  const customerRows = await fetchBookings({ ...base, ...customerNameWhere(q) });
  if (customerRows.length) return { rows: customerRows, mode: "customer" };

  const dressRows = await fetchBookings({ ...base, ...dressNameWhere(q) });
  return { rows: dressRows, mode: "dress" };
}

/** Search Booking — empty search shows all records for the selected month. */
export async function monthBasedSearchBookings(queryText: string, refDateStr?: string, category = "") {
  const q = queryText.trim();
  const refDate = parseDate(refDateStr || todayIso());
  const { y, m, monthKey } = monthRangeFromRefDate(refDate);

  // No search text: booked & delivered only for this delivery month (no returned).
  if (!q) {
    const results = await bookingsInMonth(y, m, category);
    return {
      mode: "month" as SearchMode,
      month: monthKey,
      results: results.map(serializeBookingForList),
    };
  }

  if (q.length < 2) {
    return { mode: "date" as SearchMode, results: [] };
  }

  // Text entered: only matching records, sorted nearest to the entered date.
  let { rows: results, mode } = await matchBookingsByQuery(q, category);

  // If nothing matched globally, try prev/current/next month before giving up.
  if (!results.length) {
    const y = refDate.getUTCFullYear();
    const m = refDate.getUTCMonth();
    const prevM = m === 0 ? 11 : m - 1;
    const prevY = m === 0 ? y - 1 : y;
    const nextM = m === 11 ? 0 : m + 1;
    const nextY = m === 11 ? y + 1 : y;

    const [r1, r2, r3] = await Promise.all([
      bookingsInMonth(prevY, prevM, category),
      bookingsInMonth(y, m, category),
      bookingsInMonth(nextY, nextM, category),
    ]);
    const monthRows = dedupeById([...r1, ...r2, ...r3]);
    const filtered = monthRows.filter((b) => bookingMatchesQuery(b, q));
    results = dedupeById([...results, ...filtered]);
  }

  results = sortByRelevance(results, refDate);
  return { mode, results: results.map(serializeBookingForList) };
}

function bookingMatchesQuery(b: BookingWithItems, q: string): boolean {
  if (/^\d+$/.test(q)) {
    const serial = parseInt(q.slice(0, 3), 10);
    if (!Number.isNaN(serial) && b.monthlySerial === serial) return true;
    if (q.length > 3) {
      const d = digitsOnly(q);
      return (b.contact1 || "").includes(d) || (b.whatsappNo || "").includes(d);
    }
    return false;
  }
  if (digitsOnly(q).length >= 10) {
    const d = digitsOnly(q);
    return (b.contact1 || "").includes(d) || (b.whatsappNo || "").includes(d);
  }
  const words = q.trim().split(/\s+/).filter(Boolean);
  if (words.every((w) => b.customerName.toLowerCase().includes(w.toLowerCase()))) return true;
  const dressHay = [
    b.dressName || "",
    ...(b.bookingItems || []).map((bi) => bi.dressName),
    b.legacyItem?.sku || "",
    ...(b.bookingItems || []).map((bi) => bi.item?.sku || ""),
  ].join(" ").toLowerCase();
  return words.every((w) => dressHay.includes(w.toLowerCase()));
}

export async function suggestDashboardSerial(prefix: string, refDateStr?: string) {
  const digits = prefix.replace(/\D/g, "");
  if (!digits.length || digits.length > 3) return [];

  const serial = parseInt(digits, 10);
  if (Number.isNaN(serial)) return [];

  const refDate = parseDate(refDateStr || todayIso());
  const bookings = await searchBySerialMonths(serial, refDate);

  return bookings.slice(0, 8).map((b) => ({
    type: "serial" as const,
    serial: b.monthlySerial,
    customer_name: b.customerName,
    delivery_date: b.deliveryDate.toISOString().slice(0, 10),
    id: b.id,
  }));
}
