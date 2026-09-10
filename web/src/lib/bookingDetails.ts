import { formatDate, formatBookingDateTime } from "./constants";
import { bookingDressLabels, dressDisplayName, serializeBookingItems, bookingDressCount } from "./dress";
import { isStarBooking } from "./starBooking";

/** Standard customer + booking fields shown on every list/menu. */
export type StandardBookingDetails = {
  customer_name: string;
  customer_address: string;
  total_rent: number;
  total_fitting_charges?: number;
  security_deposit: number;
  dress_names: string;
  dress_count: number;
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
  totalFittingCharges?: number;
  price?: number;
  totalAdvance?: number;
  advance?: number;
  totalRemaining?: number;
  remaining?: number;
  securityDeposit?: number;
  securityCollected?: number | null;
  remainingCollected?: number | null;
  status?: string | null;
  commonNotes?: string | null;
  notes?: string | null;
  deliveryNotes?: string | null;
  deliveryDate: Date | string | null;
  deliveryTime: string;
  returnDate: Date | string | null;
  returnTime: string;
  createdAt?: Date | string | null;
};

export function serializeStandardBookingDetails(b: BookingForStandardDetails): StandardBookingDetails {
  const rawItems = (b.bookingItems || []) as Array<{
    dressName: string;
    category?: string | null;
    size?: string | null;
    notes?: string | null;
    itemDeliveryNotes?: string | null;
    item?: { size?: string | null } | null;
  }>;
  let itemNotes = "";
  if (rawItems.length) {
    const deliveryItemNotes = rawItems
      .filter((bi) => bi.itemDeliveryNotes?.trim())
      .map((bi) => {
        const label = dressDisplayName(bi.dressName, bi.category, bi.size || bi.item?.size);
        return rawItems.length > 1 ? `${label}: ${bi.itemDeliveryNotes}` : (bi.itemDeliveryNotes || "");
      })
      .join("; ");
    itemNotes = deliveryItemNotes;
    if (!itemNotes) {
      itemNotes = rawItems
        .filter((bi) => bi.notes?.trim())
        .map((bi) => {
          const label = dressDisplayName(bi.dressName, bi.category, bi.size || bi.item?.size);
          return rawItems.length > 1 ? `${label}: ${bi.notes}` : (bi.notes || "");
        })
        .join("; ");
    }
    if (!itemNotes && rawItems.length === 1 && b.notes?.trim()) {
      itemNotes = b.notes;
    }
  } else if (b.notes?.trim()) {
    itemNotes = b.notes;
  }

  const bookingWhen = b.createdAt ? formatBookingDateTime(b.createdAt) : { date: "", time: "" };
  const commonNotes = (b.deliveryNotes?.trim() || b.commonNotes || "").trim();

  return {
    customer_name: b.customerName,
    customer_address: b.customerAddress || "",
    total_rent: b.totalPrice || b.price || 0,
    total_fitting_charges: b.totalFittingCharges || 0,
    security_deposit: bookingSecurityDisplayAmount({
      status: b.status,
      securityDeposit: b.securityDeposit,
      securityCollected: b.securityCollected,
      remainingCollected: b.remainingCollected,
      items: (b.bookingItems || []) as Array<{
        itemSecurityCollected?: number | null;
        itemRemainingCollected?: number | null;
        isDelivered?: boolean | null;
      }>,
    }),
    dress_names: bookingDressLabels(b),
    dress_count: bookingDressCount(b),
    item_notes: itemNotes,
    common_notes: commonNotes,
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
  items: ReadonlyArray<{ itemRemainingCollected?: number | null }>,
): number {
  return items.reduce((s, row) => s + (row.itemRemainingCollected || 0), 0);
}

/** Booking-level collected amount, or item sum if higher (covers partial sync). */
export function effectiveRemainingCollected(
  bookingCollected: number | null | undefined,
  items: ReadonlyArray<{ itemRemainingCollected?: number | null }> = [],
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

/** Detect legacy delivery saves where remaining/security/deposit were overwritten
 *  with the same cash amount (old deposit overwrite bug). Do not treat legitimate
 *  equal remaining+security collections as duplicates. */
export function isDuplicatedDeliveryCashBooking(booking: {
  remainingCollected?: number | null;
  securityCollected?: number | null;
  securityDeposit?: number | null;
  bookingItems?: ReadonlyArray<{
    itemRemainingCollected?: number | null;
    itemSecurityCollected?: number | null;
  }> | null;
}): boolean {
  const rem = effectiveRemainingCollected(booking.remainingCollected, booking.bookingItems || []);
  const sec = effectiveSecurityCollected(booking.securityCollected, booking.bookingItems || []);
  const dep = booking.securityDeposit || 0;
  // Classic overwrite: same positive amount stored in remaining, security, and deposit.
  if (rem > 0 && sec > 0 && rem === sec && dep === sec) return true;
  return false;
}

/** Unpaid leftover after booking-time remaining minus amounts collected at delivery. */
export function unpaidBalanceAfterDelivery(booking: {
  totalRemaining?: number | null;
  remaining?: number | null;
  remainingCollected?: number | null;
  securityCollected?: number | null;
  securityDeposit?: number | null;
  bookingItems?: ReadonlyArray<{
    itemRemainingCollected?: number | null;
    itemSecurityCollected?: number | null;
  }> | null;
}): number {
  const total = booking.totalRemaining ?? booking.remaining ?? 0;
  if (isDuplicatedDeliveryCashBooking(booking)) {
    return Math.max(0, total);
  }
  return balanceLeftToCollect(
    total,
    effectiveRemainingCollected(booking.remainingCollected, booking.bookingItems || []),
  );
}

/** Sum of per-dress security collected at delivery. */
export function sumItemSecurityCollected(
  items: ReadonlyArray<{ itemSecurityCollected?: number | null }>,
): number {
  return items.reduce((s, row) => s + (row.itemSecurityCollected || 0), 0);
}

export function effectiveSecurityCollected(
  bookingCollected: number | null | undefined,
  items: ReadonlyArray<{ itemSecurityCollected?: number | null }> = [],
): number {
  return Math.max(bookingCollected || 0, sumItemSecurityCollected(items));
}

/** Security shown on lists/records: delivery-collected wins once dress is out. */
export function bookingSecurityDisplayAmount(opts: {
  status?: string | null;
  securityDeposit?: number | null;
  securityCollected?: number | null;
  remainingCollected?: number | null;
  items?: Array<{
    itemSecurityCollected?: number | null;
    itemRemainingCollected?: number | null;
    isDelivered?: boolean | null;
  }>;
}): number {
  if (
    isDuplicatedDeliveryCashBooking({
      remainingCollected: opts.remainingCollected,
      securityCollected: opts.securityCollected,
      securityDeposit: opts.securityDeposit,
      bookingItems: opts.items,
    })
  ) {
    return 0;
  }
  const items = opts.items || [];
  const collected = effectiveSecurityCollected(opts.securityCollected, items);
  const deposit = opts.securityDeposit || 0;
  const dressOut =
    items.some((i) => i.isDelivered) ||
    opts.status === "delivered" ||
    opts.status === "returned" ||
    opts.status === "incomplete_return";
  if (dressOut) {
    // Delivery page amount is source of truth after handover (including ₹0).
    return collected;
  }
  return deposit;
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
  remainingCollected?: number | null;
  items?: Array<{
    itemSecurityCollected?: number | null;
    itemRemainingCollected?: number | null;
    isDelivered?: boolean;
  }>;
  dressIsOut?: boolean;
}): number {
  const { status, securityHeld, securityCollected, securityDeposit, items = [] } = opts;
  if (status === "returned" || status === "cancelled") return 0;

  if (
    isDuplicatedDeliveryCashBooking({
      remainingCollected: opts.remainingCollected,
      securityCollected,
      securityDeposit,
      bookingItems: items,
    })
  ) {
    return 0;
  }

  const collected = effectiveSecurityCollected(securityCollected, items);

  if (status === "incomplete_return") {
    return (securityHeld != null && securityHeld > 0) ? securityHeld : collected;
  }

  if (securityHeld != null && securityHeld > 0) {
    // Legacy overwrite set securityHeld === securityDeposit === collected; ignore that mirror.
    if (securityDeposit === securityHeld && collected === securityHeld) return 0;
    // Held only copied from booking-time deposit with nothing collected at delivery.
    if (securityDeposit === securityHeld && collected === 0) return 0;
    return securityHeld;
  }
  if (collected > 0) return collected;
  // After delivery, do not fall back to booking-time deposit — delivery amount is source of truth.
  return 0;
}
