import prisma from "@/lib/prisma";
import {
  whereDeliveryInRange,
  whereReturnOnDate,
  whereUnavailableDuringPeriod,
} from "@/lib/bookingDateQuery";
import { dressDisplayName } from "@/lib/dress";
import { bookingDressPrismaWhereQuick } from "@/lib/search/textMatch";
import {
  bookingListRecordFrom,
  WARNING_BOOKED_ON_RETURN,
  WARNING_RETURNING_ON_DELIVERY,
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
import { getCategoryDivisionLists } from "@/lib/categories";
import {
  packingDivision,
  parsePackingDivisionFilter,
  type CategoryDivisionLists,
  type PackingDivision,
} from "@/lib/packingDivision";
import { catalogPhotoRef } from "@/lib/catalogPhotoRef";
import type { Prisma } from "@prisma/client";

/** Full export for PDF — separate from paginated list (max 500 rows). */
export const BOOKING_LIST_EXPORT_MAX = 500;

type ItemRow = {
  dress_name: string;
  display_name: string;
  category: string;
  size: string;
  price: number;
  notes: string;
  photo: string;
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
  /** Booked Items alternate section: returning on From / delivering on To. */
  alternate_kind?: "returning" | "delivering" | "both";
};

type ListCategoryFilter = {
  /** Exact dress category, or empty when filtering by whole division / none. */
  exactCategory: string;
  division: PackingDivision | null;
  divisionCategories: string[];
  categoryLists: CategoryDivisionLists | null;
  /** True when any category or division filter is active. */
  active: boolean;
  /** Raw query value (used in cache keys). */
  raw: string;
};

async function resolveListCategoryFilter(raw: string): Promise<ListCategoryFilter> {
  const value = (raw || "").trim();
  const division = parsePackingDivisionFilter(value);
  if (division) {
    const categoryLists = await getCategoryDivisionLists();
    return {
      exactCategory: "",
      division,
      divisionCategories: [...categoryLists[division]],
      categoryLists,
      active: true,
      raw: value,
    };
  }
  return {
    exactCategory: value,
    division: null,
    divisionCategories: [],
    categoryLists: null,
    active: Boolean(value),
    raw: value,
  };
}

function bookingListCategoryWhere(filter: ListCategoryFilter): Prisma.BookingWhereInput {
  if (filter.exactCategory) {
    const category = filter.exactCategory;
    return {
      OR: [
        { bookingItems: { some: { category } } },
        {
          selectedJewellery: {
            some: { status: "active", category },
          },
        },
        {
          AND: [
            { bookingItems: { none: {} } },
            { legacyItem: { is: { category } } },
          ],
        },
      ],
    };
  }
  if (filter.division && filter.divisionCategories.length) {
    const cats = filter.divisionCategories;
    return {
      OR: [
        { bookingItems: { some: { category: { in: cats } } } },
        {
          bookingItems: {
            some: {
              item: {
                is: {
                  OR: [{ category: { in: cats } }, { subCategory: { in: cats } }],
                },
              },
            },
          },
        },
        {
          selectedJewellery: {
            some: {
              status: "active",
              OR: [{ category: { in: cats } }, { item: { is: { category: { in: cats } } } }],
            },
          },
        },
        {
          AND: [
            { bookingItems: { none: {} } },
            { legacyItem: { is: { category: { in: cats } } } },
          ],
        },
      ],
    };
  }
  return {};
}

function itemMatchesListCategoryFilter(
  category: string,
  dressName: string,
  filter: ListCategoryFilter,
): boolean {
  if (!filter.active) return true;
  if (filter.exactCategory) return category === filter.exactCategory;
  if (filter.division && filter.categoryLists) {
    return packingDivision(category, dressName, null, filter.categoryLists) === filter.division;
  }
  return true;
}

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
  securityCollected: true,
  bookingItems: {
    select: {
      itemId: true,
      dressName: true,
      category: true,
      price: true,
      size: true,
      notes: true,
      isDelivered: true,
      itemSecurityCollected: true,
      item: {
        select: {
          photo: true,
          thumbnailPhoto: true,
          originalPhoto: true,
        },
      },
    },
  },
  legacyItem: {
    select: {
      size: true,
      category: true,
      photo: true,
      thumbnailPhoto: true,
      originalPhoto: true,
    },
  },
  selectedJewellery: {
    where: { status: "active" },
    select: {
      id: true,
      itemId: true,
      name: true,
      category: true,
      photo: true,
      note: true,
      pickNecklace: true,
      pickEarrings: true,
      pickTeeka: true,
      pickPasa: true,
      item: {
        select: {
          photo: true,
          thumbnailPhoto: true,
          originalPhoto: true,
        },
      },
    },
  },
} as const;

type BookingLite = Awaited<
  ReturnType<typeof prisma.booking.findMany<{ select: typeof bookingListSelect }>>
>[number];

function buildItems(
  b: BookingLite,
  categoryFilter: ListCategoryFilter,
  returningMap?: Map<string, WarningInfo[]>,
  bookedMap?: Map<string, WarningInfo[]>,
): ItemRow[] {
  const delIso = formatDate(b.deliveryDate, "iso");
  const retIso = formatDate(b.returnDate, "iso");
  const rows: ItemRow[] = [];

  if (b.bookingItems.length) {
    for (const bi of b.bookingItems) {
      if (!itemMatchesListCategoryFilter(bi.category || "", bi.dressName || "", categoryFilter)) {
        continue;
      }
      const sz = bi.size || "";
      rows.push({
        dress_name: bi.dressName,
        display_name: dressDisplayName(bi.dressName, bi.category, sz),
        category: bi.category || "",
        size: sz,
        price: bi.price,
        notes: bi.notes || "",
        photo: bi.item ? catalogPhotoRef(bi.item) : "",
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
    if (!itemMatchesListCategoryFilter(cat, b.dressName, categoryFilter)) return [];
    const sz = b.legacyItem?.size || "";
    rows.push({
      dress_name: b.dressName,
      display_name: dressDisplayName(b.dressName, cat, sz),
      category: cat,
      size: sz,
      price: b.price,
      notes: b.notes || "",
      photo: b.legacyItem ? catalogPhotoRef(b.legacyItem) : "",
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
    if (!itemMatchesListCategoryFilter(cat, j.name || "", categoryFilter)) continue;
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
      photo: catalogPhotoRef(j.item) || catalogPhotoRef({ photo: j.photo }) || "",
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
  categoryFilter: ListCategoryFilter,
  returningMap?: Map<string, WarningInfo[]>,
  bookedMap?: Map<string, WarningInfo[]>,
  reason?: string,
): BookingListRow | null {
  const items = buildItems(b, categoryFilter, returningMap, bookedMap);
  if (!items.length && categoryFilter.active) return null;

  const record = bookingListRecordFrom({
    ...b,
    id: b.id,
    monthlySerial: b.monthlySerial,
  } as Parameters<typeof bookingListRecordFrom>[0]);
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
  dressQuery?: string;
  page?: number;
  pageSize?: number;
  section?: "main" | "unavailable";
};

function dressNameSearchWhere(dressQuery: string) {
  return bookingDressPrismaWhereQuick(dressQuery);
}

export async function getBookingListData(opts: BookingListQuery) {
  const {
    deliveryDateStr,
    returnDateStr,
    categoryFilter = "",
    deliveryTimeFilter = "",
    returnTimeFilter = "",
    dressQuery = "",
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
  const rangeEnd = returnDateStr || deliveryDateStr;

  const [dateRangeWhere, unavailDateWhere] = await Promise.all([
    whereDeliveryInRange(deliveryDateStr, rangeEnd),
    whereUnavailableDuringPeriod(deliveryDateStr, rangeEnd),
  ]);

  const timeFilter = {
    ...(deliveryTimeFilter ? { deliveryTime: deliveryTimeFilter } : {}),
    ...(returnTimeFilter ? { returnTime: returnTimeFilter } : {}),
  };

  const listCategoryFilter = await resolveListCategoryFilter(categoryFilter);
  const categoryWhere = bookingListCategoryWhere(listCategoryFilter);

  const mainWhere = {
    status: { in: ["booked", "delivered"] as string[] },
    ...dateRangeWhere,
    ...timeFilter,
    ...categoryWhere,
    ...dressNameSearchWhere(dressQuery),
  };

  const unavailWhere = {
    status: { in: ["booked", "delivered"] as string[] },
    ...unavailDateWhere,
    ...timeFilter,
    ...categoryWhere,
    ...dressNameSearchWhere(dressQuery),
  };

  const safePage = Math.max(1, page);
  const take = Math.min(BOOKING_LIST_EXPORT_MAX, Math.max(1, pageSize));
  const queryWhere = section === "unavailable" ? unavailWhere : mainWhere;
  const skip = (safePage - 1) * take;

  // Only count the section being loaded — callers that need both use getBookingListPageBundle.
  const [sectionTotal, pageBookings] = await Promise.all([
    limitedDbRead(() =>
      prisma.booking.count({
        where: queryWhere,
      }),
    ),
    limitedDbRead(() =>
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
    ),
  ]);

  const bookings =
    section === "main"
      ? pageBookings
          .map((b) => serializeBooking(b, listCategoryFilter))
          .filter((b): b is BookingListRow => b !== null)
      : [];

  const unavailable =
    section === "unavailable"
      ? pageBookings
          .map((b) => {
            const row = serializeBooking(b, listCategoryFilter);
            if (!row) return null;
            row.reason = `Delivered ${formatDate(b.deliveryDate, "display")} (before ${fromDisplay}) - returns ${formatDate(b.returnDate, "display")} (before ${toDisplay})`;
            return row;
          })
          .filter((b): b is BookingListRow => b !== null)
      : [];

  const totalMain = section === "main" ? sectionTotal : 0;
  const totalUnavailable = section === "unavailable" ? sectionTotal : 0;

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

/**
 * One shared where/count pair + two page queries — avoids the old pattern of running
 * getBookingListData twice (which duplicated date filters and both counts).
 */
export async function getBookingListPageBundle(opts: Omit<BookingListQuery, "section">) {
  const {
    deliveryDateStr,
    returnDateStr,
    categoryFilter = "",
    deliveryTimeFilter = "",
    returnTimeFilter = "",
    dressQuery = "",
    page = 1,
    pageSize = BOOKING_LIST_PAGE_SIZE,
  } = opts;

  if (!deliveryDateStr) {
    return {
      bookings: [],
      unavailable: [],
      alternate: [],
      from_date: "",
      to_date: "",
      page: 1,
      pageSize,
      totalMain: 0,
      totalUnavailable: 0,
      totalAlternate: 0,
      totalPagesMain: 1,
      totalPagesUnavailable: 1,
    };
  }

  const dDate = parseDate(deliveryDateStr);
  let rDate = returnDateStr ? parseDate(returnDateStr) : dDate;
  if (rDate < dDate) rDate = dDate;

  const fromDisplay = formatDate(dDate, "display");
  const toDisplay = formatDate(rDate, "display");
  const rangeEnd = returnDateStr || deliveryDateStr;
  const fromIso = formatDate(dDate, "iso");
  const toIso = formatDate(rDate, "iso");
  const sameDayPeriod = fromIso === toIso;

  const [dateRangeWhere, unavailDateWhere, returningOnFromWhere, returningOnToWhere] =
    await Promise.all([
      whereDeliveryInRange(deliveryDateStr, rangeEnd),
      whereUnavailableDuringPeriod(deliveryDateStr, rangeEnd),
      whereReturnOnDate(deliveryDateStr),
      sameDayPeriod ? Promise.resolve(null) : whereReturnOnDate(rangeEnd),
    ]);

  const timeFilter = {
    ...(deliveryTimeFilter ? { deliveryTime: deliveryTimeFilter } : {}),
    ...(returnTimeFilter ? { returnTime: returnTimeFilter } : {}),
  };

  const listCategoryFilter = await resolveListCategoryFilter(categoryFilter);
  const categoryWhere = bookingListCategoryWhere(listCategoryFilter);

  const activeStatus = { status: { in: ["booked", "delivered"] as string[] } };
  const commonFilters = {
    ...timeFilter,
    ...categoryWhere,
    ...dressNameSearchWhere(dressQuery),
  };

  const mainWhere = {
    ...activeStatus,
    ...dateRangeWhere,
    ...commonFilters,
  };

  const unavailWhere = {
    ...activeStatus,
    ...unavailDateWhere,
    ...commonFilters,
  };

  // Alternate returners: return on From (delivery day) OR return on To (return day).
  // Wrap in AND so category/dress OR filters do not overwrite the return-date OR.
  const alternateReturningWhere = {
    ...activeStatus,
    AND: [
      returningOnToWhere
        ? { OR: [returningOnFromWhere, returningOnToWhere] }
        : returningOnFromWhere,
      ...(deliveryTimeFilter || returnTimeFilter ? [timeFilter] : []),
      ...(listCategoryFilter.active ? [categoryWhere] : []),
      ...(dressQuery.trim() ? [dressNameSearchWhere(dressQuery)] : []),
    ],
  };

  const safePage = Math.max(1, page);
  const take = Math.min(BOOKING_LIST_EXPORT_MAX, Math.max(1, pageSize));
  const skip = (safePage - 1) * take;

  // One semaphore slot, three parallel reads — skip COUNT and skip warning fan-out (slow).
  // Delivering-on-To is derived from main rows (no 4th query).
  const [mainRows, unavailRows, returningRows] = await limitedDbRead(() =>
    Promise.all([
      prisma.booking.findMany({
        where: mainWhere,
        select: bookingListSelect,
        orderBy: [{ deliveryDate: "asc" }, { deliveryTime: "asc" }],
        skip,
        take,
      }),
      prisma.booking.findMany({
        where: unavailWhere,
        select: bookingListSelect,
        orderBy: [{ deliveryDate: "asc" }, { returnTime: "asc" }],
        skip,
        take,
      }),
      prisma.booking.findMany({
        where: alternateReturningWhere,
        select: bookingListSelect,
        orderBy: [{ returnTime: "asc" }, { monthlySerial: "asc" }],
        take,
      }),
    ]),
  );

  const deliveringRows = sameDayPeriod
    ? []
    : mainRows.filter((b) => formatDate(b.deliveryDate, "iso") === toIso);

  type AlternateLite = BookingLite & { alternate_kind: "returning" | "delivering" | "both" };
  const alternateById = new Map<number, AlternateLite>();
  for (const b of returningRows) {
    alternateById.set(b.id, { ...b, alternate_kind: "returning" });
  }
  for (const b of deliveringRows) {
    const prev = alternateById.get(b.id);
    if (prev) prev.alternate_kind = "both";
    else alternateById.set(b.id, { ...b, alternate_kind: "delivering" });
  }
  const alternateLite = [...alternateById.values()];
  const alternateIds = new Set(alternateLite.map((b) => b.id));
  const deliveringIds = new Set(deliveringRows.map((b) => b.id));

  const mainFiltered = sameDayPeriod
    ? mainRows
    : mainRows.filter((b) => !deliveringIds.has(b.id));

  const unavailFiltered = unavailRows.filter((b) => !alternateIds.has(b.id));

  const bookings = mainFiltered
    .map((b) => serializeBooking(b, listCategoryFilter))
    .filter((b): b is BookingListRow => b !== null);

  const unavailable = unavailFiltered
    .map((b) => {
      const row = serializeBooking(b, listCategoryFilter);
      if (!row) return null;
      row.reason = `Delivered ${formatDate(b.deliveryDate, "display")} (before ${fromDisplay}) - returns ${formatDate(b.returnDate, "display")} (before ${toDisplay})`;
      return row;
    })
    .filter((b): b is BookingListRow => b !== null);

  const alternate = alternateLite
    .map((b) => {
      const row = serializeBooking(b, listCategoryFilter);
      if (!row) return null;
      row.alternate_kind = b.alternate_kind;
      const retIso = formatDate(b.returnDate, "iso");
      const retDisplay = formatDate(b.returnDate, "display");
      if (b.alternate_kind === "both") {
        row.reason = `${WARNING_RETURNING_ON_DELIVERY} · ${WARNING_BOOKED_ON_RETURN} (${toDisplay})`;
      } else if (b.alternate_kind === "returning") {
        row.reason =
          retIso === fromIso
            ? `${WARNING_RETURNING_ON_DELIVERY} (${fromDisplay})`
            : `Returning on ${retDisplay}`;
      } else {
        row.reason = `${WARNING_BOOKED_ON_RETURN} (${toDisplay})`;
      }
      return row;
    })
    .filter((b): b is BookingListRow => b !== null);

  return {
    bookings,
    unavailable,
    alternate,
    from_date: fromIso,
    to_date: toIso,
    page: safePage,
    pageSize: take,
    totalMain: bookings.length,
    totalUnavailable: unavailable.length,
    totalAlternate: alternate.length,
    totalPagesMain: 1,
    totalPagesUnavailable: 1,
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
      return serializeBooking(
        b,
        {
          exactCategory: "",
          division: null,
          divisionCategories: [],
          categoryLists: null,
          active: false,
          raw: "",
        },
        returningMap,
        bookedMap,
        reason,
      );
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
        (opts.dressQuery || "").trim().toLowerCase(),
        String(opts.page ?? 1),
        String(opts.pageSize ?? BOOKING_LIST_PAGE_SIZE),
      ],
      () => getBookingListPageBundle(opts),
      12,
    ),
  );
}

/** Full export for PDF — uses the shared page bundle at export page size. */
export async function getBookingListExportData(opts: Omit<BookingListQuery, "page" | "pageSize">) {
  const data = await getBookingListPageBundle({
    ...opts,
    page: 1,
    pageSize: BOOKING_LIST_EXPORT_MAX,
  });
  return {
    bookings: data.bookings,
    unavailable: data.unavailable,
    alternate: data.alternate,
    from_date: data.from_date,
    to_date: data.to_date,
    truncated:
      data.totalMain > BOOKING_LIST_EXPORT_MAX ||
      data.totalUnavailable > BOOKING_LIST_EXPORT_MAX ||
      data.totalAlternate > BOOKING_LIST_EXPORT_MAX,
  };
}
