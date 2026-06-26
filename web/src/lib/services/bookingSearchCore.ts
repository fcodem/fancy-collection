import { activeBookingWhere } from "@/lib/bookingActiveStatus";
import { whereDeliveryInRange } from "@/lib/bookingDateQuery";
import {
  parseDate,
  todayIso,
} from "@/lib/constants";
import { serializeBookingForList } from "@/lib/booking";
import {
  DASHBOARD_SEARCH_LIMIT,
  parseSearchPageParams,
  searchPageMeta,
  type SearchPageMeta,
} from "@/lib/searchPagination";
import type { Booking, BookingItem, ClothingItem, Prisma } from "@prisma/client";

export type BookingWithItems = Booking & {
  bookingItems: (BookingItem & { item?: Pick<ClothingItem, "size" | "sku"> | null })[];
  legacyItem?: Pick<ClothingItem, "size" | "category" | "sku"> | null;
};

export type SearchMode = "serial" | "customer" | "phone" | "dress" | "mixed" | "year" | "month" | "date";

export type SearchResponse = {
  mode: SearchMode;
  month?: string;
  results: ReturnType<typeof serializeBookingForList>[];
} & SearchPageMeta;

/** Lean include for list/search — avoids loading full inventory rows. */
const bookingListInclude = {
  bookingItems: {
    select: {
      dressName: true,
      category: true,
      size: true,
      notes: true,
      itemSecurityCollected: true,
      isDelivered: true,
      item: { select: { size: true, sku: true } },
    },
  },
  legacyItem: { select: { size: true, category: true, sku: true } },
} as const;

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
  skip?: number,
  lean = true,
) {
  return prisma.booking.findMany({
    where: { ...activeBookingWhere(), ...where },
    include: lean ? bookingListInclude : bookingInclude,
    ...(orderBy ? { orderBy } : {}),
    ...(take ? { take } : {}),
    ...(skip ? { skip } : {}),
  }) as Promise<BookingWithItems[]>;
}

export async function fetchBookingsPage(
  where: Prisma.BookingWhereInput,
  orderBy: Prisma.BookingOrderByWithRelationInput | Prisma.BookingOrderByWithRelationInput[],
  page: number,
  pageSize: number,
) {
  const fullWhere = { ...activeBookingWhere(), ...where };
  const skip = (page - 1) * pageSize;
  const [total, rows] = await Promise.all([
    prisma.booking.count({ where: fullWhere }),
    prisma.booking.findMany({
      where: fullWhere,
      include: bookingListInclude,
      orderBy,
      skip,
      take: pageSize,
    }),
  ]);
  return {
    rows: rows as BookingWithItems[],
    ...searchPageMeta(total, page, pageSize),
  };
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

function dashboardResults(rows: BookingWithItems[], mode: SearchMode, meta?: SearchPageMeta) {
  const active = filterDashboardActive(rows).map(serializeBookingForList);
  return {
    mode,
    results: active,
    total: meta?.total ?? active.length,
    page: meta?.page ?? 1,
    pageSize: meta?.pageSize ?? active.length,
    hasMore: meta?.hasMore ?? false,
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
    return { mode: "mixed" as SearchMode, results: [], total: 0, page: 1, pageSize: DASHBOARD_SEARCH_LIMIT, hasMore: false };
  }

  const refDate = parseDate(refDateStr || todayIso());
  const orderBy: Prisma.BookingOrderByWithRelationInput[] = [
    { deliveryDate: "desc" },
    { monthlySerial: "asc" },
  ];

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
      const phoneRows = await fetchBookings(
        { ...phoneWhere(q), status: { in: [...DASHBOARD_ACTIVE_STATUSES] } },
        orderBy,
        DASHBOARD_SEARCH_LIMIT,
      );
      results = dedupeById([...results, ...phoneRows]);
    }
    const active = filterDashboardActive(results).slice(0, DASHBOARD_SEARCH_LIMIT);
    return dashboardResults(active, q.length <= 3 ? "serial" : "mixed");
  }

  if (digitsOnly(q).length >= 10) {
    const page = await fetchBookingsPage(
      { ...phoneWhere(q), status: { in: [...DASHBOARD_ACTIVE_STATUSES] } },
      orderBy,
      1,
      DASHBOARD_SEARCH_LIMIT,
    );
    return dashboardResults(page.rows, "phone", page);
  }

  const customerPage = await fetchBookingsPage(
    { ...customerNameWhere(q), status: { in: [...DASHBOARD_ACTIVE_STATUSES] } },
    orderBy,
    1,
    DASHBOARD_SEARCH_LIMIT,
  );
  if (customerPage.total) {
    return dashboardResults(sortByRelevance(customerPage.rows, refDate), "customer", customerPage);
  }

  const dressPage = await fetchBookingsPage(
    { ...dressNameWhere(q), status: { in: [...DASHBOARD_ACTIVE_STATUSES] } },
    orderBy,
    1,
    DASHBOARD_SEARCH_LIMIT,
  );
  return dashboardResults(sortByRelevance(dressPage.rows, refDate), "dress", dressPage);
}

/** All Record / Advanced Search — full history in year; customer name = lifetime. */
export async function universalSearchBookings(
  queryText: string,
  refDateStr?: string,
  category = "",
  pageRaw?: string | null,
  pageSizeRaw?: string | null,
): Promise<SearchResponse> {
  const q = queryText.trim();
  const refDate = parseDate(refDateStr || todayIso());
  const yearFilter = yearDeliveryWhere(refDate);
  const catFilter = categoryWhere(category);
  const { page, pageSize } = parseSearchPageParams(pageRaw, pageSizeRaw);
  const orderBy: Prisma.BookingOrderByWithRelationInput[] = [
    { deliveryDate: "desc" },
    { monthlySerial: "asc" },
  ];

  if (!q) {
    const pageResult = await fetchBookingsPage(
      { ...yearFilter, ...catFilter },
      orderBy,
      page,
      pageSize,
    );
    return {
      mode: "year",
      results: pageResult.rows.map(serializeBookingForList),
      total: pageResult.total,
      page: pageResult.page,
      pageSize: pageResult.pageSize,
      hasMore: pageResult.hasMore,
    };
  }

  if (q.length < 2) {
    return { mode: "year", results: [], total: 0, page, pageSize, hasMore: false };
  }

  if (/^\d+$/.test(q)) {
    const serialFromPrefix = parseInt(q.slice(0, 3), 10);
    let where: Prisma.BookingWhereInput = { ...yearFilter, ...catFilter };
    let mode: SearchMode = q.length <= 3 ? "serial" : "mixed";
    if (!Number.isNaN(serialFromPrefix)) {
      where = { ...where, monthlySerial: serialFromPrefix };
    }
    if (q.length > 3) {
      where = { ...where, OR: [{ monthlySerial: serialFromPrefix }, phoneWhere(q)] };
      mode = "mixed";
    }
    const pageResult = await fetchBookingsPage(where, orderBy, page, pageSize);
    return {
      mode,
      results: pageResult.rows.map(serializeBookingForList),
      total: pageResult.total,
      page: pageResult.page,
      pageSize: pageResult.pageSize,
      hasMore: pageResult.hasMore,
    };
  }

  if (digitsOnly(q).length >= 10) {
    const pageResult = await fetchBookingsPage(
      { ...phoneWhere(q), ...yearFilter, ...catFilter },
      orderBy,
      page,
      pageSize,
    );
    return {
      mode: "phone",
      results: sortByRelevance(pageResult.rows, refDate).map(serializeBookingForList),
      total: pageResult.total,
      page: pageResult.page,
      pageSize: pageResult.pageSize,
      hasMore: pageResult.hasMore,
    };
  }

  const customerPage = await fetchBookingsPage(
    { ...customerNameWhere(q), ...catFilter },
    orderBy,
    page,
    pageSize,
  );
  if (customerPage.total) {
    return {
      mode: "customer",
      results: sortByRelevance(customerPage.rows, refDate).map(serializeBookingForList),
      total: customerPage.total,
      page: customerPage.page,
      pageSize: customerPage.pageSize,
      hasMore: customerPage.hasMore,
    };
  }

  const dressPage = await fetchBookingsPage(
    { ...dressNameWhere(q), ...yearFilter, ...catFilter },
    orderBy,
    page,
    pageSize,
  );
  return {
    mode: "dress",
    results: sortByRelevance(dressPage.rows, refDate).map(serializeBookingForList),
    total: dressPage.total,
    page: dressPage.page,
    pageSize: dressPage.pageSize,
    hasMore: dressPage.hasMore,
  };
}

function activeBookingWhere(category: string): Prisma.BookingWhereInput {
  return {
    status: { in: ["booked", "delivered"] },
    ...categoryWhere(category),
  };
}

function buildActiveQueryWhere(q: string, category: string): { where: Prisma.BookingWhereInput; mode: SearchMode } {
  const base = activeBookingWhere(category);

  if (/^\d+$/.test(q)) {
    const serial = parseInt(q.slice(0, 3), 10);
    if (q.length > 3 && !Number.isNaN(serial)) {
      return {
        where: { ...base, OR: [{ monthlySerial: serial }, phoneWhere(q)] },
        mode: "mixed",
      };
    }
    if (!Number.isNaN(serial)) {
      return { where: { ...base, monthlySerial: serial }, mode: "serial" };
    }
    return { where: { ...base, ...phoneWhere(q) }, mode: "phone" };
  }

  if (digitsOnly(q).length >= 10) {
    return { where: { ...base, ...phoneWhere(q) }, mode: "phone" };
  }

  return { where: { ...base, ...customerNameWhere(q) }, mode: "customer" };
}

async function nearMonthDeliveryWhere(refDate: Date) {
  const y = refDate.getUTCFullYear();
  const m = refDate.getUTCMonth();
  const prevY = m === 0 ? y - 1 : y;
  const prevM = m === 0 ? 11 : m - 1;
  const nextY = m === 11 ? y + 1 : y;
  const nextM = m === 11 ? 0 : m + 1;
  const fromStr = `${prevY}-${String(prevM + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(nextY, nextM + 1, 0)).getUTCDate();
  const toStr = `${nextY}-${String(nextM + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return whereDeliveryInRange(fromStr, toStr);
}

/** Search Booking — empty search shows all records for the selected month. */
export async function monthBasedSearchBookings(
  queryText: string,
  refDateStr?: string,
  category = "",
  pageRaw?: string | null,
  pageSizeRaw?: string | null,
): Promise<SearchResponse> {
  const q = queryText.trim();
  const refDate = parseDate(refDateStr || todayIso());
  const { y, m, monthKey } = monthRangeFromRefDate(refDate);
  const { page, pageSize } = parseSearchPageParams(pageRaw, pageSizeRaw);
  const orderBy: Prisma.BookingOrderByWithRelationInput[] = [
    { deliveryDate: "asc" },
    { monthlySerial: "asc" },
  ];

  if (!q) {
    const monthWhere = await monthDeliveryWhereFromRefDate(new Date(Date.UTC(y, m, 15)));
    const pageResult = await fetchBookingsPage(
      { ...monthWhere, ...activeBookingWhere(category) },
      orderBy,
      page,
      pageSize,
    );
    return {
      mode: "month",
      month: monthKey,
      results: pageResult.rows.map(serializeBookingForList),
      total: pageResult.total,
      page: pageResult.page,
      pageSize: pageResult.pageSize,
      hasMore: pageResult.hasMore,
    };
  }

  if (q.length < 2) {
    return { mode: "date", results: [], total: 0, page, pageSize, hasMore: false };
  }

  let { where, mode } = buildActiveQueryWhere(q, category);
  let pageResult = await fetchBookingsPage(where, orderBy, page, pageSize);

  if (!pageResult.total && mode === "customer") {
    ({ where, mode } = { where: { ...activeBookingWhere(category), ...dressNameWhere(q) }, mode: "dress" });
    pageResult = await fetchBookingsPage(where, orderBy, page, pageSize);
  }

  if (!pageResult.total) {
    const nearMonth = await nearMonthDeliveryWhere(refDate);
    ({ where, mode } = buildActiveQueryWhere(q, category));
    pageResult = await fetchBookingsPage({ ...where, ...nearMonth }, orderBy, page, pageSize);
    if (!pageResult.total && mode === "customer") {
      pageResult = await fetchBookingsPage(
        { ...activeBookingWhere(category), ...dressNameWhere(q), ...nearMonth },
        orderBy,
        page,
        pageSize,
      );
      mode = "dress";
    }
  }

  const sorted = sortByRelevance(pageResult.rows, refDate);
  return {
    mode,
    results: sorted.map(serializeBookingForList),
    total: pageResult.total,
    page: pageResult.page,
    pageSize: pageResult.pageSize,
    hasMore: pageResult.hasMore,
  };
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
