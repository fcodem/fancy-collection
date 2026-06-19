import { formatDate } from "./constants";
import { bookingDressLabels, dressDisplayName, serializeBookingItems } from "./dress";

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
