import prisma, { parseDateQ } from "@/lib/prisma";
import {
  whereDeliveryInRange,
  whereUnavailableDuringPeriod,
} from "@/lib/bookingDateQuery";
import { dressDisplayName } from "@/lib/dress";
import {
  bookingListRecordFrom,
  bookingWarningRecordFrom,
  type BookingWarningRecord,
} from "@/lib/bookingDetails";
import { formatDate, parseDate } from "@/lib/constants";
import { resolveBookingStatus } from "@/lib/bookingStatus";

type WarningInfo = BookingWarningRecord & { booking_id: number };

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
};

const bookingSelect = {
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
      item: { select: { photo: true, size: true, category: true } },
    },
  },
  legacyItem: { select: { photo: true, size: true, category: true } },
} as const;

type BookingLite = Awaited<ReturnType<typeof prisma.booking.findMany<{ select: typeof bookingSelect }>>>[number];

function itemIds(b: Pick<BookingLite, "itemId" | "bookingItems">): number[] {
  if (b.bookingItems.length) return b.bookingItems.map((bi) => bi.itemId);
  if (b.itemId) return [b.itemId];
  return [];
}

function warningFrom(b: BookingLite): WarningInfo {
  const rec = bookingWarningRecordFrom({ ...b, id: b.id, monthlySerial: b.monthlySerial });
  return { ...rec, booking_id: b.id };
}

function buildWarningMaps(edgeBookings: BookingLite[]) {
  const returning = new Map<string, WarningInfo[]>();
  const booked = new Map<string, WarningInfo[]>();

  for (const b of edgeBookings) {
    const ids = itemIds(b);
    const retKey = formatDate(b.returnDate, "iso");
    const delKey = formatDate(b.deliveryDate, "iso");
    const w = warningFrom(b);
    for (const id of ids) {
      const rk = `${retKey}-${id}`;
      const dk = `${delKey}-${id}`;
      if (!returning.has(rk)) returning.set(rk, []);
      if (!booked.has(dk)) booked.set(dk, []);
      returning.get(rk)!.push(w);
      booked.get(dk)!.push(w);
    }
  }
  return { returning, booked };
}

function pickWarning(
  map: Map<string, WarningInfo[]>,
  dateIso: string,
  itemId: number,
  excludeBookingId: number
): BookingWarningRecord | null {
  const list = map.get(`${dateIso}-${itemId}`);
  if (!list?.length) return null;
  const hit = list.find((w) => w.booking_id !== excludeBookingId);
  if (!hit) return null;
  const { booking_id: _, ...rest } = hit;
  return rest;
}

function buildItems(
  b: BookingLite,
  categoryFilter: string,
  returningMap: Map<string, WarningInfo[]>,
  bookedMap: Map<string, WarningInfo[]>
): ItemRow[] {
  const delIso = formatDate(b.deliveryDate, "iso");
  const retIso = formatDate(b.returnDate, "iso");
  const rows: ItemRow[] = [];

  if (b.bookingItems.length) {
    for (const bi of b.bookingItems) {
      if (categoryFilter && bi.category !== categoryFilter) continue;
      const sz = bi.size || bi.item?.size || "";
      rows.push({
        dress_name: bi.dressName,
        display_name: dressDisplayName(bi.dressName, bi.category, sz),
        category: bi.category || "",
        size: sz,
        price: bi.price,
        notes: bi.notes || "",
        photo: bi.item?.photo || "",
        returning_warning: pickWarning(returningMap, delIso, bi.itemId, b.id),
        booked_warning: pickWarning(bookedMap, retIso, bi.itemId, b.id),
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
      photo: b.legacyItem?.photo || "",
      returning_warning: pickWarning(returningMap, delIso, b.itemId, b.id),
      booked_warning: pickWarning(bookedMap, retIso, b.itemId, b.id),
    });
  }

  return rows;
}

function serializeBooking(
  b: BookingLite,
  categoryFilter: string,
  returningMap: Map<string, WarningInfo[]>,
  bookedMap: Map<string, WarningInfo[]>,
  reason?: string
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
    reason,
  };
}

export async function getBookingListData(
  deliveryDateStr: string,
  returnDateStr: string,
  categoryFilter = "",
  deliveryTimeFilter = "",
  returnTimeFilter = ""
) {
  if (!deliveryDateStr) {
    return { bookings: [], unavailable: [], from_date: "", to_date: "" };
  }

  const dDate = parseDate(deliveryDateStr);
  let rDate = returnDateStr ? parseDate(returnDateStr) : dDate;
  if (rDate < dDate) rDate = dDate;

  const dDateQ = parseDateQ(deliveryDateStr);
  const rDateQ = parseDateQ(returnDateStr || deliveryDateStr);

  const fromDisplay = formatDate(dDate, "display");
  const toDisplay = formatDate(rDate, "display");

  const [dateRangeWhere, unavailDateWhere] = await Promise.all([
    whereDeliveryInRange(deliveryDateStr, returnDateStr || deliveryDateStr),
    whereUnavailableDuringPeriod(deliveryDateStr, returnDateStr || deliveryDateStr),
  ]);

  const mainWhere = {
    status: { in: ["booked", "delivered"] as string[] },
    ...dateRangeWhere,
    ...(deliveryTimeFilter ? { deliveryTime: deliveryTimeFilter } : {}),
    ...(returnTimeFilter ? { returnTime: returnTimeFilter } : {}),
  };

  const unavailWhere = {
    status: { in: ["booked", "delivered"] as string[] },
    ...unavailDateWhere,
    ...(deliveryTimeFilter ? { deliveryTime: deliveryTimeFilter } : {}),
    ...(returnTimeFilter ? { returnTime: returnTimeFilter } : {}),
  };

  const [mainBookings, unavailableBookings] = await Promise.all([
    prisma.booking.findMany({
      where: mainWhere,
      select: bookingSelect,
      orderBy: [{ deliveryDate: "asc" }, { deliveryTime: "asc" }],
    }),
    prisma.booking.findMany({
      where: unavailWhere,
      select: bookingSelect,
      orderBy: [{ deliveryDate: "asc" }, { returnTime: "asc" }],
    }),
  ]);

  const edgeBookings = await prisma.booking.findMany({
    where: {
      status: { in: ["booked", "delivered"] },
      OR: [
        { returnDate: { gte: dDateQ, lte: rDateQ } },
        { deliveryDate: { gte: dDateQ, lte: rDateQ } },
      ],
    },
    select: bookingSelect,
  });

  const { returning: returningMap, booked: bookedMap } = buildWarningMaps(edgeBookings);

  const bookings = mainBookings
    .map((b) => serializeBooking(b, categoryFilter, returningMap, bookedMap))
    .filter((b): b is BookingListRow => b !== null);

  const unavailable = unavailableBookings
    .map((b) => {
      const row = serializeBooking(b, categoryFilter, returningMap, bookedMap);
      if (!row) return null;
      row.reason = `Delivered ${formatDate(b.deliveryDate, "display")} (before ${fromDisplay}) — returns ${formatDate(b.returnDate, "display")} (before ${toDisplay})`;
      return row;
    })
    .filter((b): b is BookingListRow => b !== null);

  return {
    bookings,
    unavailable,
    from_date: formatDate(dDate, "iso"),
    to_date: formatDate(rDate, "iso"),
  };
}
