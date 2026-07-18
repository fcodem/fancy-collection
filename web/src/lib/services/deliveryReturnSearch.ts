/**
 * Paginated Delivery / Return / Jewellery-list search.
 * Honours date, q, category, page, pageSize — unlike the previous unbounded findMany.
 */
import { serializeBookingForList } from "@/lib/booking";
import { whereDeliveryInRange, whereReturnInRange } from "@/lib/bookingDateQuery";
import { parseDate, todayIso } from "@/lib/constants";
import {
  categoryWhere,
  classifyNumericSearch,
  customerNameWhere,
  dressNameWhere,
  fetchBookingsPage,
  phoneWhere,
  sortByRelevance,
  type SearchMode,
  type SearchResponse,
} from "@/lib/services/bookingSearchCore";
import {
  OPERATIONAL_LIST_DEFAULT_PAGE_SIZE,
  OPERATIONAL_LIST_MAX_PAGE_SIZE,
} from "@/lib/searchPagination";
import type { Prisma } from "@prisma/client";

export type DeliveryReturnMode = "delivery" | "return";

function parsePage(pageRaw?: string | null, pageSizeRaw?: string | null) {
  const page = Math.max(1, parseInt(pageRaw || "1", 10) || 1);
  const requested =
    parseInt(pageSizeRaw || String(OPERATIONAL_LIST_DEFAULT_PAGE_SIZE), 10) ||
    OPERATIONAL_LIST_DEFAULT_PAGE_SIZE;
  const pageSize = Math.min(
    OPERATIONAL_LIST_MAX_PAGE_SIZE,
    Math.max(1, requested),
  );
  return { page, pageSize };
}

function nearbyDateWindow(refIso: string, days = 3): { from: string; to: string } {
  const ref = parseDate(refIso);
  const from = new Date(ref.getTime() - days * 86_400_000);
  const to = new Date(ref.getTime() + days * 86_400_000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(from), to: iso(to) };
}

function deliveryStatusWhere(): Prisma.BookingWhereInput {
  return { status: "booked" };
}

function returnStatusWhere(): Prisma.BookingWhereInput {
  return {
    status: { in: ["delivered", "booked"] },
    OR: [{ status: "delivered" }, { bookingItems: { some: { isDelivered: true, isCancelled: false } } }],
  };
}

function textWhere(q: string): { where: Prisma.BookingWhereInput; mode: SearchMode } {
  const trimmed = q.trim();
  if (!trimmed) return { where: {}, mode: "date" };

  const numeric = classifyNumericSearch(trimmed);
  if (numeric === "serial") {
    const serial = parseInt(trimmed, 10);
    return { where: { monthlySerial: serial }, mode: "serial" };
  }
  if (numeric === "phone") {
    return { where: phoneWhere(trimmed), mode: "phone" };
  }
  if (/^\d+$/.test(trimmed) && trimmed.length >= 4) {
    // booking id / public id digits
    const id = parseInt(trimmed, 10);
    if (!Number.isNaN(id)) {
      return {
        where: {
          OR: [{ id }, { publicBookingId: { contains: trimmed, mode: "insensitive" } }],
        },
        mode: "mixed",
      };
    }
  }

  // Prefer customer-name prefix path first; dress as fallback at call site.
  return { where: customerNameWhere(trimmed), mode: "customer" };
}

export async function searchDeliveryOrReturn(opts: {
  mode: DeliveryReturnMode;
  date?: string | null;
  q?: string | null;
  category?: string | null;
  page?: string | null;
  pageSize?: string | null;
}): Promise<SearchResponse> {
  const refIso = (opts.date || "").trim() || todayIso();
  const refDate = parseDate(refIso);
  const q = (opts.q || "").trim();
  const category = (opts.category || "").trim();
  const { page, pageSize } = parsePage(opts.page, opts.pageSize);

  const statusWhere =
    opts.mode === "delivery" ? deliveryStatusWhere() : returnStatusWhere();
  const orderBy: Prisma.BookingOrderByWithRelationInput[] =
    opts.mode === "delivery"
      ? [
          { deliveryDate: "asc" },
          { deliveryTime: "asc" },
          { monthlySerial: "asc" },
          { id: "asc" },
        ]
      : [
          { returnDate: "asc" },
          { returnTime: "asc" },
          { monthlySerial: "asc" },
          { id: "asc" },
        ];

  const cat = categoryWhere(category);
  const window = nearbyDateWindow(refIso, 3);
  const dateWhere =
    opts.mode === "delivery"
      ? await whereDeliveryInRange(window.from, window.to)
      : await whereReturnInRange(window.from, window.to);

  if (!q) {
    const pageResult = await fetchBookingsPage(
      { ...statusWhere, ...cat, ...dateWhere },
      orderBy,
      page,
      pageSize,
    );
    const sorted = sortByRelevance(pageResult.rows, refDate);
    return {
      mode: "date",
      results: sorted.map(serializeBookingForList),
      total: pageResult.total,
      page: pageResult.page,
      pageSize: pageResult.pageSize,
      hasMore: pageResult.hasMore,
    };
  }

  if (q.length < 2 && classifyNumericSearch(q) !== "serial") {
    return { mode: "date", results: [], total: 0, page, pageSize, hasMore: false };
  }

  let { where: text, mode } = textWhere(q);
  let pageResult = await fetchBookingsPage(
    { ...statusWhere, ...cat, ...text },
    orderBy,
    page,
    pageSize,
  );

  // Customer miss → dress name
  if (!pageResult.total && mode === "customer") {
    mode = "dress";
    pageResult = await fetchBookingsPage(
      { ...statusWhere, ...cat, ...dressNameWhere(q) },
      orderBy,
      page,
      pageSize,
    );
  }

  // Still empty → restrict to nearby date window with original text
  if (!pageResult.total) {
    ({ where: text, mode } = textWhere(q));
    pageResult = await fetchBookingsPage(
      { ...statusWhere, ...cat, ...text, ...dateWhere },
      orderBy,
      page,
      pageSize,
    );
    if (!pageResult.total && mode === "customer") {
      mode = "dress";
      pageResult = await fetchBookingsPage(
        { ...statusWhere, ...cat, ...dressNameWhere(q), ...dateWhere },
        orderBy,
        page,
        pageSize,
      );
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
