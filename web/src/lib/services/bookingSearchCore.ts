import prisma, { parseDateQ, startOfMonthQ, endOfMonthQ, dateQ } from "@/lib/prisma";
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
      customerName: { contains: w },
    })),
  };
}

export function dressNameWhere(q: string): Prisma.BookingWhereInput {
  const ws = words(q);
  if (!ws.length) return {};
  return {
    AND: ws.map((w) => ({
      OR: [
        { dressName: { contains: w } },
        { bookingItems: { some: { dressName: { contains: w } } } },
      ],
    })),
  };
}

export function phoneWhere(q: string): Prisma.BookingWhereInput {
  const d = digitsOnly(q);
  if (!d) return {};
  return {
    OR: [{ contact1: { contains: d } }, { whatsappNo: { contains: d } }],
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

function monthDeliveryWhere(y: number, m: number): Prisma.BookingWhereInput {
  const anchor = new Date(Date.UTC(y, m, 15));
  const monthStart = startOfMonthQ(anchor);
  const monthEnd = endOfMonthQ(anchor);
  return { deliveryDate: { gte: monthStart, lt: monthEnd } };
}

export async function fetchBookings(where: Prisma.BookingWhereInput, orderBy?: Prisma.BookingOrderByWithRelationInput, take?: number) {
  return prisma.booking.findMany({
    where: { status: { not: "cancelled" }, ...where },
    include: bookingInclude,
    ...(orderBy ? { orderBy } : {}),
    ...(take ? { take } : {}),
  });
}

/** Dashboard: serial in prev / current / next month. */
export async function searchBySerialMonths(serial: number, refDate: Date) {
  const offsets = [-1, 0, 1];
  const all: BookingWithItems[] = [];

  for (const offset of offsets) {
    const anchor = new Date(Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth() + offset, 15));
    const monthStart = startOfMonthQ(anchor);
    const monthEnd = endOfMonthQ(anchor);
    const rows = await fetchBookings({
      monthlySerial: serial,
      deliveryDate: { gte: monthStart, lt: monthEnd },
    });
    all.push(...rows);
  }

  return dedupeById(all).sort((a, b) => a.deliveryDate.getTime() - b.deliveryDate.getTime());
}

/** Universal: serial anywhere in reference year. */
export async function searchBySerialInYear(serial: number, refDate: Date) {
  const rows = await fetchBookings({
    monthlySerial: serial,
    ...yearDeliveryWhere(refDate),
  });
  return sortByRelevance(rows);
}

function isPreviousRecord(b: Booking) {
  const todayStart = parseDate(todayIso());
  if (["returned", "cancelled", "incomplete_return"].includes(b.status)) {
    return b.returnDate.getTime() < todayStart.getTime();
  }
  return false;
}

export async function dashboardSearchBookings(queryText: string, refDateStr?: string) {
  const q = queryText.trim();
  if (q.length < 2) {
    return { mode: "mixed" as SearchMode, results: [] };
  }

  const refDate = parseDate(refDateStr || todayIso());

  if (/^\d+$/.test(q)) {
    const serialFromPrefix = parseInt(q.slice(0, 3), 10);
    let results: BookingWithItems[] = [];
    if (!Number.isNaN(serialFromPrefix)) {
      results = await searchBySerialMonths(serialFromPrefix, refDate);
    }
    if (q.length > 3) {
      const phoneRows = await fetchBookings(phoneWhere(q));
      results = dedupeById([
        ...results,
        ...sortByRelevance(phoneRows.filter((b) => !isPreviousRecord(b))),
      ]);
    }
    return {
      mode: q.length <= 3 ? ("serial" as const) : ("mixed" as const),
      results: results.map(serializeBookingForList),
    };
  }

  if (digitsOnly(q).length >= 10) {
    const rows = await fetchBookings(phoneWhere(q));
    return {
      mode: "phone" as const,
      results: sortByRelevance(rows.filter((b) => !isPreviousRecord(b))).map(serializeBookingForList),
    };
  }

  const customerHits = await fetchBookings(customerNameWhere(q));
  const activeCustomer = sortByRelevance(customerHits.filter((b) => !isPreviousRecord(b)));
  if (activeCustomer.length) {
    return { mode: "customer", results: activeCustomer.map(serializeBookingForList) };
  }

  const dressRows = await fetchBookings(dressNameWhere(q));
  return {
    mode: "dress",
    results: sortByRelevance(dressRows.filter((b) => !isPreviousRecord(b))).map(serializeBookingForList),
  };
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
      const phoneRows = await fetchBookings({ ...phoneWhere(q), ...yearFilter, ...catFilter });
      results = dedupeById([...results, ...sortByRelevance(phoneRows)]);
    }
    return {
      mode: q.length <= 3 ? ("serial" as const) : ("mixed" as const),
      results: results.map(serializeBookingForList),
    };
  }

  if (digitsOnly(q).length >= 10) {
    const rows = await fetchBookings({ ...phoneWhere(q), ...yearFilter, ...catFilter });
    return { mode: "phone", results: sortByRelevance(rows).map(serializeBookingForList) };
  }

  const customerRows = await fetchBookings({ ...customerNameWhere(q), ...catFilter });
  if (customerRows.length) {
    return {
      mode: "customer",
      results: sortByRelevance(customerRows).map(serializeBookingForList),
    };
  }

  const dressRows = await fetchBookings({ ...dressNameWhere(q), ...yearFilter, ...catFilter });
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
  return fetchBookings({
    ...monthDeliveryWhere(y, m),
    ...activeBookingWhere(category),
  });
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

async function bookingsNearReferenceDate(refDate: Date, category: string, includeAdjacentMonths: boolean) {
  const y = refDate.getUTCFullYear();
  const m = refDate.getUTCMonth();
  const monthTuples: Array<[number, number]> = [[y, m]];

  if (includeAdjacentMonths) {
    const prevM = m === 0 ? 11 : m - 1;
    const prevY = m === 0 ? y - 1 : y;
    const nextM = m === 11 ? 0 : m + 1;
    const nextY = m === 11 ? y + 1 : y;
    monthTuples.unshift([prevY, prevM]);
    monthTuples.push([nextY, nextM]);
  }

  let all: BookingWithItems[] = [];
  for (const [yr, mo] of monthTuples) {
    all.push(...(await bookingsInMonth(yr, mo, category)));
  }
  return dedupeById(all);
}

/** Search Booking — date shows nearest records; text shows strict matches only. */
export async function monthBasedSearchBookings(queryText: string, refDateStr?: string, category = "") {
  const q = queryText.trim();
  const refDate = parseDate(refDateStr || todayIso());

  // Date only (optional category): show active bookings nearest to the entered date.
  if (!q) {
    let results = await bookingsNearReferenceDate(refDate, category, false);
    if (!results.length) {
      results = await bookingsNearReferenceDate(refDate, category, true);
    }
    results = sortByRelevance(results, refDate);
    return { mode: "date" as SearchMode, results: results.map(serializeBookingForList) };
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

    for (const [yr, mo] of [[prevY, prevM], [y, m], [nextY, nextM]] as Array<[number, number]>) {
      const monthRows = await bookingsInMonth(yr, mo, category);
      const filtered = monthRows.filter((b) => bookingMatchesQuery(b, q));
      results.push(...filtered);
    }
    results = dedupeById(results);
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
