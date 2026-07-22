/**
 * Keyset-paginated Delivery / Return / Jewellery booking search.
 * Exact indexed paths run before prefix/fuzzy fallbacks.
 */
import prisma from "@/lib/prisma";
import { serializeBookingForList, type BookingWithItems } from "@/lib/booking";
import { whereDeliveryInRange, whereReturnInRange } from "@/lib/bookingDateQuery";
import { todayIso } from "@/lib/constants";
import {
  OPERATIONAL_LIST_DEFAULT_PAGE_SIZE,
  OPERATIONAL_LIST_MAX_PAGE_SIZE,
} from "@/lib/searchPagination";
import {
  decodeOperationalSearchCursor,
  encodeOperationalSearchCursor,
  type OperationalSearchCursor,
} from "@/lib/operationalSearchCursor";
import type { Prisma } from "@prisma/client";

export type DeliveryReturnMode = "delivery" | "return";
type SearchMode = "date" | "id" | "serial" | "phone" | "customer" | "dress" | "fuzzy";

const operationalBookingSelect = {
  id: true,
  bookingNumber: true,
  monthlySerial: true,
  customerName: true,
  customerAddress: true,
  contact1: true,
  whatsappNo: true,
  venue: true,
  staffNames: true,
  status: true,
  dressName: true,
  notes: true,
  commonNotes: true,
  deliveryDate: true,
  deliveryTime: true,
  returnDate: true,
  returnTime: true,
  createdAt: true,
  totalPrice: true,
  totalAdvance: true,
  totalRemaining: true,
  remainingCollected: true,
  securityDeposit: true,
  securityCollected: true,
  securityHeld: true,
  deliveryNotes: true,
  bookingItems: {
    where: { isCancelled: false },
    select: {
      dressName: true,
      category: true,
      size: true,
      notes: true,
      price: true,
      itemSecurityCollected: true,
      isDelivered: true,
      isReturned: true,
      item: { select: { size: true, sku: true } },
    },
  },
  legacyItem: { select: { size: true, category: true, sku: true } },
} satisfies Prisma.BookingSelect;

function encodeCursor(row: BookingWithItems, mode: DeliveryReturnMode): string {
  const payload: OperationalSearchCursor = {
    date: (mode === "delivery" ? row.deliveryDate : row.returnDate).toISOString(),
    time: mode === "delivery" ? row.deliveryTime : row.returnTime,
    id: row.id,
  };
  return encodeOperationalSearchCursor(payload);
}

function keysetWhere(
  mode: DeliveryReturnMode,
  cursor: OperationalSearchCursor | null,
): Prisma.BookingWhereInput {
  if (!cursor) return {};
  const date = new Date(cursor.date);
  const dateField = mode === "delivery" ? "deliveryDate" : "returnDate";
  const timeField = mode === "delivery" ? "deliveryTime" : "returnTime";
  return {
    OR: [
      { [dateField]: { gt: date } },
      { [dateField]: date, [timeField]: { gt: cursor.time } },
      { [dateField]: date, [timeField]: cursor.time, id: { gt: cursor.id } },
    ],
  };
}

function statusWhere(mode: DeliveryReturnMode): Prisma.BookingWhereInput {
  if (mode === "delivery") {
    return {
      status: "booked",
      OR: [
        { bookingItems: { some: { isCancelled: false, isDelivered: false } } },
        { bookingItems: { none: {} } },
      ],
    };
  }
  return {
    status: { in: ["booked", "delivered"] },
    OR: [
      {
        bookingItems: {
          some: { isCancelled: false, isDelivered: true, isReturned: false },
        },
      },
      { status: "delivered", bookingItems: { none: {} } },
    ],
  };
}

function categoryWhere(category: string): Prisma.BookingWhereInput {
  if (!category) return {};
  return {
    OR: [
      { bookingItems: { some: { category, isCancelled: false } } },
      { bookingItems: { none: {} }, legacyItem: { is: { category } } },
    ],
  };
}

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

async function fetchPage(args: {
  mode: DeliveryReturnMode;
  base: Prisma.BookingWhereInput[];
  search?: Prisma.BookingWhereInput;
  cursor: OperationalSearchCursor | null;
  limit: number;
}) {
  const dateField = args.mode === "delivery" ? "deliveryDate" : "returnDate";
  const timeField = args.mode === "delivery" ? "deliveryTime" : "returnTime";
  const rows = await prisma.booking.findMany({
    where: {
      AND: [
        ...args.base,
        args.search ?? {},
        keysetWhere(args.mode, args.cursor),
      ],
    },
    select: operationalBookingSelect,
    orderBy: [{ [dateField]: "asc" }, { [timeField]: "asc" }, { id: "asc" }],
    take: args.limit + 1,
  });
  const hasMore = rows.length > args.limit;
  const visible = rows.slice(0, args.limit) as BookingWithItems[];
  return {
    rows: visible,
    hasMore,
    nextCursor: hasMore && visible.length
      ? encodeCursor(visible[visible.length - 1]!, args.mode)
      : null,
  };
}

export async function searchDeliveryOrReturn(opts: {
  mode: DeliveryReturnMode;
  date?: string | null;
  q?: string | null;
  category?: string | null;
  cursor?: string | null;
  limit?: string | null;
  page?: string | null;
  pageSize?: string | null;
}) {
  const refIso = (opts.date || "").trim() || todayIso();
  const q = (opts.q || "").trim();
  const category = (opts.category || "").trim();
  const requested = Number(opts.limit || opts.pageSize || OPERATIONAL_LIST_DEFAULT_PAGE_SIZE);
  const limit = Math.min(OPERATIONAL_LIST_MAX_PAGE_SIZE, Math.max(1, requested || OPERATIONAL_LIST_DEFAULT_PAGE_SIZE));
  const page = Math.max(1, Number(opts.page || 1) || 1);
  const cursor = decodeOperationalSearchCursor(opts.cursor);
  const dateWhere =
    opts.mode === "delivery"
      ? await whereDeliveryInRange(refIso, refIso)
      : await whereReturnInRange(refIso, refIso);
  const base = [statusWhere(opts.mode), categoryWhere(category)];
  const scopedBase = (includeDate: boolean) =>
    includeDate ? [...base, dateWhere] : base;
  const searchScoped = opts.mode === "delivery";

  let mode: SearchMode = "date";
  let result;

  if (!q) {
    result = await fetchPage({ mode: opts.mode, base: scopedBase(true), cursor, limit });
  } else {
    const numeric = /^\d+$/.test(q);
    const id = numeric ? Number(q) : 0;

    // 1. Exact booking ID.
    if (numeric && Number.isSafeInteger(id)) {
      mode = "id";
      result = await fetchPage({ mode: opts.mode, base: scopedBase(searchScoped), search: { id }, cursor, limit });
    }

    // 2. Exact monthly serial.
    if ((!result || !result.rows.length) && numeric) {
      mode = "serial";
      result = await fetchPage({
        mode: opts.mode,
        base: scopedBase(searchScoped),
        search: { monthlySerial: id },
        cursor,
        limit,
      });
    }

    const digits = digitsOnly(q);
    // 3. Exact normalized phone, then 4. suffix.
    if ((!result || !result.rows.length) && digits.length >= 4) {
      mode = "phone";
      result = await fetchPage({
        mode: opts.mode,
        base: scopedBase(searchScoped),
        search: { OR: [{ contact1: digits }, { whatsappNo: digits }] },
        cursor,
        limit,
      });
      if (!result.rows.length) {
        result = await fetchPage({
          mode: opts.mode,
          base: scopedBase(searchScoped),
          search: {
            OR: [
              { contact1: { endsWith: digits, mode: "insensitive" } },
              { whatsappNo: { endsWith: digits, mode: "insensitive" } },
            ],
          },
          cursor,
          limit,
        });
      }
    }

    // 5. Customer prefix.
    if (!result || !result.rows.length) {
      mode = "customer";
      result = await fetchPage({
        mode: opts.mode,
        base: scopedBase(searchScoped),
        search: { customerName: { startsWith: q, mode: "insensitive" } },
        cursor,
        limit,
      });
    }

    // 6. Dress prefix.
    if (!result.rows.length) {
      mode = "dress";
      result = await fetchPage({
        mode: opts.mode,
        base: scopedBase(searchScoped),
        search: {
          OR: [
            { dressName: { startsWith: q, mode: "insensitive" } },
            { bookingItems: { some: { dressName: { startsWith: q, mode: "insensitive" }, isCancelled: false } } },
          ],
        },
        cursor,
        limit,
      });
    }

    // 7. Bounded fuzzy fallback only after indexed paths miss.
    if (!result.rows.length && q.length >= 3) {
      mode = "fuzzy";
      result = await fetchPage({
        mode: opts.mode,
        base: scopedBase(true),
        search: {
          OR: [
            { customerName: { contains: q, mode: "insensitive" } },
            { dressName: { contains: q, mode: "insensitive" } },
            { bookingItems: { some: { dressName: { contains: q, mode: "insensitive" }, isCancelled: false } } },
          ],
        },
        cursor,
        limit,
      });
    }
  }

  const rows = result?.rows ?? [];
  return {
    mode,
    results: rows.map(serializeBookingForList),
    page,
    pageSize: limit,
    total: (page - 1) * limit + rows.length + (result?.hasMore ? 1 : 0),
    totalExact: false,
    hasMore: result?.hasMore ?? false,
    nextCursor: result?.nextCursor ?? null,
  };
}
