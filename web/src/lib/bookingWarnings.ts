import prisma, { parseDateQ } from "@/lib/prisma";
import { dressDisplayName, bookingItemSize } from "@/lib/dress";
import {
  bookingWarningRecordFrom,
  type BookingWarningRecord,
} from "@/lib/bookingDetails";
import { formatDate } from "@/lib/constants";
import { warningPanelsFromItems, type ItemWarningSource } from "@/lib/bookingWarningPdf";
import type { PdfWarningPanel } from "@/lib/pdfWarningDraw";

type WarningInfo = BookingWarningRecord & { booking_id: number };

export type { WarningInfo };

export type WarningMapBooking = {
  id: number;
  monthlySerial: number;
  customerName: string;
  customerAddress?: string | null;
  contact1?: string | null;
  whatsappNo?: string | null;
  venue?: string | null;
  staffNames?: string | null;
  deliveryDate: Date;
  deliveryTime: string;
  returnDate: Date;
  returnTime: string;
  totalPrice?: number;
  price?: number;
  totalAdvance?: number;
  advance?: number;
  totalRemaining?: number;
  remaining?: number;
  commonNotes?: string | null;
  notes?: string | null;
  securityDeposit?: number | null;
  dressName?: string | null;
  itemId?: number | null;
  bookingItems: Array<{
    itemId: number | null;
    dressName: string;
    category?: string | null;
    size?: string | null;
    notes?: string | null;
    item?: { size?: string | null } | null;
  }>;
  legacyItem?: { size?: string | null; category?: string | null } | null;
};

function itemIds(b: Pick<WarningMapBooking, "itemId" | "bookingItems">): number[] {
  if (b.bookingItems.length) {
    return b.bookingItems.map((bi) => bi.itemId).filter((id): id is number => id != null);
  }
  if (b.itemId) return [b.itemId];
  return [];
}

function warningFrom(b: WarningMapBooking): WarningInfo {
  const rec = bookingWarningRecordFrom({
    ...b,
    id: b.id,
    monthlySerial: b.monthlySerial,
    customerName: b.customerName,
    customerAddress: b.customerAddress,
    contact1: b.contact1,
    whatsappNo: b.whatsappNo,
    venue: b.venue,
    staffNames: b.staffNames,
    totalPrice: b.totalPrice,
    price: b.price,
    totalAdvance: b.totalAdvance,
    advance: b.advance,
    totalRemaining: b.totalRemaining,
    remaining: b.remaining,
    commonNotes: b.commonNotes,
    notes: b.notes,
    securityDeposit: b.securityDeposit ?? 0,
    deliveryDate: b.deliveryDate,
    deliveryTime: b.deliveryTime,
    returnDate: b.returnDate,
    returnTime: b.returnTime,
    bookingItems: b.bookingItems,
  });
  return { ...rec, booking_id: b.id };
}

export function buildWarningMaps(edgeBookings: WarningMapBooking[]) {
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

export function pickWarning(
  map: Map<string, WarningInfo[]>,
  dateIso: string,
  itemId: number | undefined,
  excludeBookingId: number,
): BookingWarningRecord | null {
  if (itemId == null) return null;
  const list = map.get(`${dateIso}-${itemId}`);
  if (!list?.length) return null;
  const hit = list.find((w) => w.booking_id !== excludeBookingId);
  if (!hit) return null;
  const { booking_id: _, ...rest } = hit;
  return rest;
}

export function warningItemsForBooking(
  b: WarningMapBooking,
  returningMap: Map<string, WarningInfo[]>,
  bookedMap: Map<string, WarningInfo[]>,
): ItemWarningSource[] {
  const delIso = formatDate(b.deliveryDate, "iso");
  const retIso = formatDate(b.returnDate, "iso");
  const items: ItemWarningSource[] = [];

  if (b.bookingItems.length) {
    for (const bi of b.bookingItems) {
      const display = dressDisplayName(bi.dressName, bi.category, bookingItemSize(bi));
      items.push({
        item_id: bi.itemId ?? undefined,
        display_name: display,
        dress_name: bi.dressName,
        returning_warning: pickWarning(returningMap, delIso, bi.itemId ?? undefined, b.id),
        booked_warning: pickWarning(bookedMap, retIso, bi.itemId ?? undefined, b.id),
      });
    }
  } else if (b.itemId && b.dressName) {
    const cat = b.legacyItem?.category || "";
    const display = dressDisplayName(b.dressName, cat, b.legacyItem?.size || "");
    items.push({
      item_id: b.itemId,
      display_name: display,
      dress_name: b.dressName,
      returning_warning: pickWarning(returningMap, delIso, b.itemId, b.id),
      booked_warning: pickWarning(bookedMap, retIso, b.itemId, b.id),
    });
  }

  return items;
}

export function pdfWarningsForBooking(
  b: WarningMapBooking,
  returningMap: Map<string, WarningInfo[]>,
  bookedMap: Map<string, WarningInfo[]>,
): PdfWarningPanel[] {
  const items = warningItemsForBooking(b, returningMap, bookedMap);
  return warningPanelsFromItems(items);
}

/** Load edge bookings for warning detection across a date span (inclusive). */
export async function fetchWarningEdgeBookings(
  fromIso: string,
  toIso: string,
  opts?: { itemIds?: number[]; take?: number },
) {
  const dDateQ = parseDateQ(fromIso);
  const rDateQ = parseDateQ(toIso);
  const itemIds = (opts?.itemIds || []).filter((id) => Number.isFinite(id) && id > 0);
  const itemFilter =
    itemIds.length > 0
      ? {
          OR: [
            { itemId: { in: itemIds } },
            { bookingItems: { some: { itemId: { in: itemIds } } } },
          ],
        }
      : null;

  return prisma.booking.findMany({
    where: {
      status: { in: ["booked", "delivered"] },
      AND: [
        {
          OR: [
            { returnDate: { gte: dDateQ, lte: rDateQ } },
            { deliveryDate: { gte: dDateQ, lte: rDateQ } },
          ],
        },
        ...(itemFilter ? [itemFilter] : []),
      ],
    },
    include: { bookingItems: { include: { item: true } }, legacyItem: true },
    ...(opts?.take && opts.take > 0 ? { take: opts.take } : {}),
  });
}

export function dateSpanFromBookings(bookings: Array<{ deliveryDate: Date; returnDate: Date }>) {
  if (!bookings.length) return { from: "", to: "" };
  let min = bookings[0].deliveryDate.getTime();
  let max = bookings[0].returnDate.getTime();
  for (const b of bookings) {
    min = Math.min(min, b.deliveryDate.getTime(), b.returnDate.getTime());
    max = Math.max(max, b.deliveryDate.getTime(), b.returnDate.getTime());
  }
  return {
    from: formatDate(new Date(min), "iso"),
    to: formatDate(new Date(max), "iso"),
  };
}

/** Load alternate-booking warnings (returning on delivery / booked on return) for one booking. */
export async function loadWarningItemsForBooking(booking: WarningMapBooking) {
  const span = dateSpanFromBookings([booking]);
  if (!span.from) return [];
  const visibleItemIds = itemIds(booking);
  if (visibleItemIds.length === 0) return [];
  // Record pages only need conflicts for their visible items. Without this filter
  // every record open loaded all bookings across the date span and all item rows.
  const edgeBookings = await fetchWarningEdgeBookings(span.from, span.to, {
    itemIds: visibleItemIds,
    take: 250,
  });
  const { returning, booked } = buildWarningMaps(edgeBookings);
  return warningItemsForBooking(booking, returning, booked);
}

export type { ItemWarningSource } from "@/lib/bookingWarningPdf";
