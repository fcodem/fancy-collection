import { formatDate, formatBookingDateTime } from "./constants";
import { bookingDressLabels, dressDisplayName, serializeBookingItems } from "./dress";
import { isStarBooking } from "./starBooking";

/** Standard customer + booking fields shown on every list/menu. */
export type StandardBookingDetails = {
  customer_name: string;
  customer_address: string;
  total_rent: number;
  security_deposit: number;
  dress_names: string;
  item_notes: string;
  common_notes: string;
  delivery_date: string;
  delivery_time: string;
  return_date: string;
  return_time: string;
  booking_date: string;
  booking_time: string;
  is_star?: boolean;
};

/** Full record view — standard fields plus contact, venue, and payment breakdown. */
export type RecordBookingDetails = StandardBookingDetails & {
  contact1: string;
  whatsapp: string;
  venue: string;
  total_advance: number;
  total_remaining: number;
};

export type BookingForStandardDetails = Parameters<typeof serializeBookingItems>[0] & {
  customerName: string;
  customerAddress?: string | null;
  contact1?: string | null;
  whatsappNo?: string | null;
  venue?: string | null;
  totalPrice?: number;
  price?: number;
  totalAdvance?: number;
  advance?: number;
  totalRemaining?: number;
  remaining?: number;
  securityDeposit?: number;
  commonNotes?: string | null;
  notes?: string | null;
  deliveryDate: Date | string;
  deliveryTime: string;
  returnDate: Date | string;
  returnTime: string;
  createdAt?: Date | string | null;
};

export function serializeStandardBookingDetails(b: BookingForStandardDetails): StandardBookingDetails {
  const rawItems = (b.bookingItems || []) as Array<{
    dressName: string;
    category?: string | null;
    size?: string | null;
    notes?: string | null;
    item?: { size?: string | null } | null;
  }>;
  let itemNotes = "";
  if (rawItems.length) {
    itemNotes = rawItems
      .filter((bi) => bi.notes?.trim())
      .map((bi) => {
        const label = dressDisplayName(bi.dressName, bi.category, bi.size || bi.item?.size);
        return rawItems.length > 1 ? `${label}: ${bi.notes}` : (bi.notes || "");
      })
      .join("; ");
    if (!itemNotes && rawItems.length === 1 && b.notes?.trim()) {
      itemNotes = b.notes;
    }
  } else if (b.notes?.trim()) {
    itemNotes = b.notes;
  }

  const bookingWhen = b.createdAt ? formatBookingDateTime(b.createdAt) : { date: "", time: "" };

  return {
    customer_name: b.customerName,
    customer_address: b.customerAddress || "",
    total_rent: b.totalPrice || b.price || 0,
    security_deposit: b.securityDeposit || 0,
    dress_names: bookingDressLabels(b),
    item_notes: itemNotes,
    common_notes: b.commonNotes || "",
    delivery_date: formatDate(b.deliveryDate, "display"),
    delivery_time: b.deliveryTime,
    return_date: formatDate(b.returnDate, "display"),
    return_time: b.returnTime,
    booking_date: bookingWhen.date,
    booking_time: bookingWhen.time,
    is_star: isStarBooking(b as Parameters<typeof isStarBooking>[0]),
  };
}

export function serializeRecordBookingDetails(b: BookingForStandardDetails): RecordBookingDetails {
  const std = serializeStandardBookingDetails(b);
  return {
    ...std,
    contact1: b.contact1 || "",
    whatsapp: b.whatsappNo || "",
    venue: b.venue || "",
    total_advance: b.totalAdvance ?? b.advance ?? 0,
    total_remaining: b.totalRemaining ?? b.remaining ?? 0,
  };
}

/** Flat object for API responses — merges standard details with list metadata. */
export function withStandardBookingDetails<T extends Record<string, unknown>>(
  b: Parameters<typeof serializeStandardBookingDetails>[0],
  extra: T
) {
  return { ...extra, ...serializeStandardBookingDetails(b) };
}

export type BookingForListRecord = BookingForStandardDetails & {
  id?: number;
  monthlySerial: number;
  staffNames?: string | null;
};

/** Full booking record for lists (excludes remaining balance & security deposit in UI). */
export function bookingListRecordFrom(b: BookingForListRecord) {
  const std = serializeStandardBookingDetails(b);
  return {
    id: b.id,
    serial_no: b.monthlySerial,
    contact_1: b.contact1 || "",
    whatsapp_no: b.whatsappNo || "",
    venue: b.venue || "",
    staff_names: b.staffNames || "",
    total_advance: b.totalAdvance ?? b.advance ?? 0,
    ...std,
  };
}

export type BookingWarningRecord = ReturnType<typeof bookingListRecordFrom> & {
  booking_id?: number;
};

export function bookingWarningRecordFrom(b: BookingForListRecord): BookingWarningRecord {
  const row = bookingListRecordFrom(b);
  return { booking_id: b.id, ...row };
}

export const WARNING_RETURNING_ON_DELIVERY = "Returning on the date of delivery";
export const WARNING_BOOKED_ON_RETURN = "Booked on the return date";

/** Sum of per-dress remaining collected at delivery. */
export function sumItemRemainingCollected(
  items: Array<{ itemRemainingCollected?: number | null }>,
): number {
  return items.reduce((s, row) => s + (row.itemRemainingCollected || 0), 0);
}

/** Booking-level collected amount, or item sum if higher (covers partial sync). */
export function effectiveRemainingCollected(
  bookingCollected: number | null | undefined,
  items: Array<{ itemRemainingCollected?: number | null }> = [],
): number {
  return Math.max(bookingCollected || 0, sumItemRemainingCollected(items));
}

/** Total remaining balance still to collect after delivery collections. */
export function balanceLeftToCollect(
  totalRemaining: number | null | undefined,
  collectedAtDelivery: number | null | undefined,
): number {
  return Math.max(0, (totalRemaining || 0) - (collectedAtDelivery || 0));
}

/** Sum of per-dress security collected at delivery. */
export function sumItemSecurityCollected(
  items: Array<{ itemSecurityCollected?: number | null }>,
): number {
  return items.reduce((s, row) => s + (row.itemSecurityCollected || 0), 0);
}

export function effectiveSecurityCollected(
  bookingCollected: number | null | undefined,
  items: Array<{ itemSecurityCollected?: number | null }> = [],
): number {
  return Math.max(bookingCollected || 0, sumItemSecurityCollected(items));
}

/** Sum of per-dress security held on incomplete return. */
export function sumItemSecurityHeld(
  items: Array<{ itemSecurityHeld?: number | null }>,
): number {
  return items.reduce((s, row) => s + (row.itemSecurityHeld || 0), 0);
}

export type IncompleteSecuritySummary = {
  totalSecurity: number;
  securityReturned: number;
  securityHeld: number;
};

/** Total security collected at delivery, amount returned to customer, and amount still held. */
export function incompleteReturnSecuritySummary(opts: {
  securityHeld?: number | null;
  securityCollected?: number | null;
  securityDeposit?: number | null;
  items?: Array<{
    itemSecurityCollected?: number | null;
    itemSecurityHeld?: number | null;
  }>;
}): IncompleteSecuritySummary {
  const totalSecurity = Math.max(
    effectiveSecurityCollected(opts.securityCollected, opts.items),
    opts.securityDeposit || 0,
  );
  const heldFromItems = sumItemSecurityHeld(opts.items || []);
  const securityHeld =
    opts.securityHeld != null && opts.securityHeld > 0
      ? opts.securityHeld
      : heldFromItems;
  const securityReturned = Math.max(0, totalSecurity - securityHeld);
  return { totalSecurity, securityReturned, securityHeld };
}

/** Security still held by the shop until the dress is returned. */
export function securityCurrentlyHeld(opts: {
  status: string;
  securityHeld?: number | null;
  securityCollected?: number | null;
  securityDeposit?: number | null;
  items?: Array<{ itemSecurityCollected?: number | null; isDelivered?: boolean }>;
  dressIsOut?: boolean;
}): number {
  const { status, securityHeld, securityCollected, securityDeposit, items = [], dressIsOut } = opts;
  if (status === "returned" || status === "cancelled") return 0;

  const collected = effectiveSecurityCollected(securityCollected, items);
  const isOut =
    dressIsOut ??
    (items.length > 0 ? items.some((i) => i.isDelivered) : status === "delivered");

  if (status === "incomplete_return") {
    return (securityHeld != null && securityHeld > 0) ? securityHeld : collected;
  }

  if (securityHeld != null && securityHeld > 0) return securityHeld;
  if (collected > 0) return collected;
  if (isOut && (securityDeposit || 0) > 0) return securityDeposit || 0;
  return 0;
}
