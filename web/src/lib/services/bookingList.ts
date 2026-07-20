import prisma from "@/lib/prisma";
import {
  whereDeliveryInRange,
  whereUnavailableDuringPeriod,
} from "@/lib/bookingDateQuery";
import { dressDisplayName } from "@/lib/dress";
import {
  bookingListRecordFrom,
  type BookingWarningRecord,
} from "@/lib/bookingDetails";
import { formatDate, parseDate } from "@/lib/constants";
import { resolveBookingStatus } from "@/lib/bookingStatus";
import {
  buildWarningMaps,
  fetchWarningBoundaryBookings,
  pickWarning,
  type WarningInfo,
} from "@/lib/bookingWarnings";
import { isStarBooking } from "@/lib/starBooking";
import { memoryCachedQuery } from "@/lib/perfCache";
import { getFreshShopRevision } from "@/lib/realtime/revision";
import { formatJewelleryPartsLabel } from "@/lib/jewelleryParts";
import { limitedDbRead } from "@/lib/readDbLimit";
import { BOOKING_LIST_PAGE_SIZE } from "@/lib/menuPerf";

type ItemRow = {
  dress_name: string;
  display_name: string;
  category: string;
  size: string;
  price: number;
  notes: string;
  returning_warning: BookingWarningRecord | null;
  booked_warning: BookingWarningRecord | null;
};

export type BookingListRow = ReturnType<typeof bookingListRecordFrom> & {
  id: number;
  booking_number: string;
  serial_no: number;
  status: string;
  items: ItemRow[];
  reason?: string;
};

export const bookingListSelect = {
  id: true,
  bookingNumber: true,
  monthlySerial: true,
  customerName: true,
  customerAddress: true,
  contact1: true,
  whatsappNo: true,
  venue: true,
  staffNames: true,
  deliveryDate: true,
  deliveryTime: true,
  returnDate: true,
  returnTime: true,
  totalPrice: true,
  totalAdvance: true,
  totalRemaining: true,
  commonNotes: true,
  status: true,
  itemId: true,
  dressName: true,
  price: true,
  advance: true,
  remaining: true,
  notes: true,
  securityDeposit: true,
  bookingItems: {
    select: {
      itemId: true,
      dressName: true,
      category: true,
      price: true,
      size: true,
      notes: true,
      isDelivered: true,
    },
  },
  legacyItem: { select: { size: true, category: true } },
  selectedJewellery: {
    where: { status: "active" },
    select: {
      id: true,
      itemId: true,
      name: true,
      category: true,
      note: true,
      pickNecklace: true,
      pickEarrings: true,
      pickTeeka: true,
      pickPasa: true,
    },
  },
} as const;

type BookingLite = Awaited<
  ReturnType<typeof prisma.booking.findMany<{ select: typeof bookingListSelect }>>
>[number];

function buildItems(
  b: BookingLite,
  categoryFilter: string,
  returningMap?: Map<string, WarningInfo[]>,
  bookedMap?: Map<string, WarningInfo[]>,
): ItemRow[] {
  const delIso = formatDate(b.deliveryDate, "iso");
  const retIso = formatDate(b.returnDate, "iso");
  const rows: ItemRow[] = [];

  if (b.bookingItems.length) {
    for (const bi of b.bookingItems) {
      if (categoryFilter && bi.category !== categoryFilter) continue;
      const sz = bi.size || "";
      rows.push({
        dress_name: bi.dressName,
        display_name: dressDisplayName(bi.dressName, bi.category, sz),
        category: bi.category || "",
        size: sz,
        price: bi.price,
        notes: bi.notes || "",
        returning_warning:
          returningMap && bookedMap
            ? pickWarning(returningMap, delIso, bi.itemId ?? undefined, b.id)
            : null,
        booked_warning:
          returningMap && bookedMap
            ? pickWarning(bookedMap, retIso, bi.itemId ?? undefined, b.id)
            : null,
      });
    }
  } else if (b.itemId && b.dressName) {
    const cat = b.legacyItem?.category || "";
    if (categoryFilter && cat !== categoryFilter) return [];
    const sz = b.legacyItem?.size || "";
    rows.push({
      dress_name: b.dressName,
      display_name: dressDisplayName(b.dressName, cat, sz),
      category: cat,
      size: sz,
      price: b.price,
      notes: b.notes || "",
      returning_warning:
        returningMap && bookedMap
          ? pickWarning(returningMap, delIso, b.itemId, b.id)
          : null,
      booked_warning:
        returningMap && bookedMap
          ? pickWarning(bookedMap, retIso, b.itemId, b.id)
          : null,
    });
  }

  for (const j of b.selectedJewellery || []) {
    const cat = j.category || "Jewellery";
    if (categoryFilter && cat !== categoryFilter) continue;
    const partsLabel = formatJewelleryPartsLabel({
      pickNecklace: j.pickNecklace,
      pickEarrings: j.pickEarrings,
      pickTeeka: j.pickTeeka,
      pickPasa: j.pickPasa,
    });
    const noteParts = [partsLabel ? `Parts: ${partsLabel}` : "", j.note || ""].filter(Boolean);
    rows.push({
      dress_name: j.name,
      display_name: j.name,
      category: cat,
      size: "",
      price: 0,
      notes: noteParts.join(" - "),
      returning_warning:
        returningMap && bookedMap && j.itemId
          ? pickWarning(returningMap, delIso, j.itemId, b.id)
          : null,
      booked_warning:
        returningMap && bookedMap && j.itemId
          ? pickWarning(bookedMap, retIso, j.itemId, b.id)
          : null,
    });
  }

  return rows;
}

function serializeBooking(
  b: BookingLite,
  categoryFilter: string,
  returningMap?: Map<string, WarningInfo[]>,
  bookedMap?: Map<string, WarningInfo[]>,
  reason?: string,
): BookingListRow | null {
  const items = buildItems(b, categoryFilter, returningMap, bookedMap);
  if (!items.length && categoryFilter) return null;

  const record = bookingListRecordFrom({ ...b, id: b.id, monthlySerial: b.monthlySerial });
  const status = resolveBookingStatus(b);

  return {
    ...record,
    id: b.id,
    booking_number: b.bookingNumber,
    serial_no: b.monthlySerial,
    status,
    items,
    is_star: isStarBooking(b),
    reason,
  };
}

function dedupeById<T extends { id: number }>(rows: T[]): T[] {
  const seen = new Set<number>();
  const out: T[] = [];
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out;
}

export type BookingListQuery = {
  deliveryDateStr: string;
  returnDateStr: string;
  categoryFilter?: string;
  deliveryTimeFilter?: string;
  returnTimeFilter?: string;
  page?: number;
  pageSize?: number;
  section?: "main" | "unavailable";
};

export async function getBookingListData(opts: BookingListQuery) {
  const {
    deliveryDateStr,
    returnDateStr,
    categoryFilter = "",
    deliveryTimeFilter = "",
    returnTimeFilter = "",
    page = 1,
    pageSize = BOOKING_LIST_PAGE_SIZE,
    section = "main",
  } = opts;

  if (!deliveryDateStr) {
    return {
      bookings: [],
      unavailable: [],
      from_date: "",
      to_date: "",
      page: 1,
      pageSize,
      totalMain: 0,
      totalUnavailable: 0,
      totalPagesMain: 1,
      totalPagesUnavailable: 1,
    };
  }

  const dDate = parseDate(deliveryDateStr);
  let rDate = returnDateStr ? parseDate(returnDateStr) : dDate;
  if (rDate < dDate) rDate = dDate;

  const fromDisplay = formatDate(dDate, "display");
  const toDisplay = formatDate(rDate, "display");

  const [dateRangeWhere, unavailDateWhere] = await Promise.all([
    whereDeliveryInRange(deliveryDateStr, returnDateStr || deliveryDateStr),
    whereUnavailableDuringPeriod(deliveryDateStr, returnDateStr || deliveryDateStr),
  ]);

  const timeFilter = {
    ...(deliveryTimeFilter ? { deliveryTime: deliveryTimeFilter } : {}),
    ...(returnTimeFilter ? { returnTime: returnTimeFilter } : {}),
  };

  const mainWhere = {
    status: { in: ["booked", "delivered"] as string[] },
    ...dateRangeWhere,
    ...timeFilter,
  };

  const unavailWhere = {
    status: { in: ["booked", "delivered"] as string[] },
    ...unavailDateWhere,
    ...timeFilter,
  };

  const safePage = Math.max(1, page);
  const take = Math.min(50, Math.max(1, pageSize));

  const [totalMain, totalUnavailable] = await Promise.all([
    limitedDbRead(() => prisma.booking.count({ where: mainWhere })),
    limitedDbRead(() => prisma.booking.count({ where: unavailWhere })),
  ]);

  const queryWhere = section === "unavailable" ? unavailWhere : mainWhere;
  const skip = (safePage - 1) * take;

  const pageBookings = await limitedDbRead(() =>
    prisma.booking.findMany({
      where: queryWhere,
      select: bookingListSelect,
      orderBy:
        section === "unavailable"
          ? [{ deliveryDate: "asc" }, { returnTime: "asc" }]
          : [{ deliveryDate: "asc" }, { deliveryTime: "asc" }],
      skip,
      take,
    }),
  );

  const bookings =
    section === "main"
      ? pageBookings
          .map((b) => serializeBooking(b, categoryFilter))
          .filter((b): b is BookingListRow => b !== null)
      : [];

  const unavailable =
    section === "unavailable"
      ? pageBookings
          .map((b) => {
            const row = serializeBooking(b, categoryFilter);
            if (!row) return null;
            row.reason = `Delivered ${formatDate(b.deliveryDate, "display")} (before ${fromDisplay}) - returns ${formatDate(b.returnDate, "display")} (before ${toDisplay})`;
            return row;
          })
          .filter((b): b is BookingListRow => b !== null)
      : [];

  return {
    bookings,
    unavailable,
    from_date: formatDate(dDate, "iso"),
    to_date: formatDate(rDate, "iso"),
    page: safePage,
    pageSize: take,
    totalMain,
    totalUnavailable,
    totalPagesMain: Math.max(1, Math.ceil(totalMain / take)),
    totalPagesUnavailable: Math.max(1, Math.ceil(totalUnavailable / take)),
  };
}

/** Load main + unavailable pages (max 2 bounded queries per section via semaphore). */
export async function getBookingListPageBundle(opts: Omit<BookingListQuery, "section">) {
  const [main, unavail] = await Promise.all([
    getBookingListData({ ...opts, section: "main" }),
    getBookingListData({ ...opts, section: "unavailable" }),
  ]);
  return {
    bookings: main.bookings,
    unavailable: unavail.unavailable,
    from_date: main.from_date,
    to_date: main.to_date,
    page: main.page,
    pageSize: main.pageSize,
    totalMain: main.totalMain,
    totalUnavailable: main.totalUnavailable,
    totalPagesMain: main.totalPagesMain,
    totalPagesUnavailable: main.totalPagesUnavailable,
  };
}

export async function attachBookingListWarnings(
  bookings: BookingLite[],
  serialized: BookingListRow[],
): Promise<BookingListRow[]> {
  const itemIds: number[] = [];
  for (const b of bookings) {
    for (const bi of b.bookingItems) {
      if (bi.itemId) itemIds.push(bi.itemId);
    }
    if (b.itemId) itemIds.push(b.itemId);
    for (const j of b.selectedJewellery || []) {
      if (j.itemId) itemIds.push(j.itemId);
    }
  }
  const uniqueIds = [...new Set(itemIds)];
  if (!uniqueIds.length || !bookings.length) return serialized;

  const delSet = new Set(bookings.map((b) => formatDate(b.deliveryDate, "iso")));
  const retSet = new Set(bookings.map((b) => formatDate(b.returnDate, "iso")));
  const edgeRows = await limitedDbRead(async () => {
    const all: Awaited<ReturnType<typeof fetchWarningBoundaryBookings>> = [];
    for (const delIso of delSet) {
      for (const retIso of retSet) {
        const chunk = await fetchWarningBoundaryBookings(delIso, retIso, uniqueIds, -1);
        all.push(...chunk);
      }
    }
    return dedupeById(all);
  });

  const { returning: returningMap, booked: bookedMap } = buildWarningMaps(edgeRows);

  return bookings
    .map((b) => {
      const reason = serialized.find((s) => s.id === b.id)?.reason;
      return serializeBooking(b, "", returningMap, bookedMap, reason);
    })
    .filter((b): b is BookingListRow => b !== null);
}

export function getBookingListDataCached(opts: Omit<BookingListQuery, "section">) {
  return getFreshShopRevision().then((rev) =>
    memoryCachedQuery(
      [
        "booking-list",
        rev,
        opts.deliveryDateStr,
        opts.returnDateStr,
        opts.categoryFilter || "",
        opts.deliveryTimeFilter || "",
        opts.returnTimeFilter || "",
        String(opts.page ?? 1),
        String(opts.pageSize ?? BOOKING_LIST_PAGE_SIZE),
      ],
      () => getBookingListPageBundle(opts),
      25,
    ),
  );
}

/** Full export for PDF — separate from paginated list (max 500 rows). */
export const BOOKING_LIST_EXPORT_MAX = 500;

export async function getBookingListExportData(opts: Omit<BookingListQuery, "page" | "pageSize">) {
  const [main, unavail] = await Promise.all([
    getBookingListData({ ...opts, page: 1, pageSize: BOOKING_LIST_EXPORT_MAX, section: "main" }),
    getBookingListData({
      ...opts,
      page: 1,
      pageSize: BOOKING_LIST_EXPORT_MAX,
      section: "unavailable",
    }),
  ]);
  return {
    bookings: main.bookings,
    unavailable: unavail.unavailable,
    from_date: main.from_date,
    to_date: main.to_date,
    truncated: main.totalMain > BOOKING_LIST_EXPORT_MAX || unavail.totalUnavailable > BOOKING_LIST_EXPORT_MAX,
  };
}
