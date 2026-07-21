import { formatDate } from "@/lib/constants";
import { formatInr } from "@/lib/format";
import {
  BRAND_FULL_NAME,
  BRAND_OWNER,
  BRAND_PHONE_PRIMARY,
  BRAND_PHONE_SECONDARY,
} from "@/lib/branding";

/** Footer line used on all WhatsApp slip templates. */
export const SLIP_WA_FOOTER = `BY TEAM FANCY COLLECTION - ${BRAND_OWNER}`;

/** Contact line shown above the team footer on every slip message. */
export const SLIP_WA_CONTACT_LINE =
  `📞 For any queries, please call or message us on ${BRAND_PHONE_PRIMARY} / ${BRAND_PHONE_SECONDARY}.`;

const THANK_YOU = `Thank you for choosing ${BRAND_FULL_NAME}.`;

/**
 * Short Google Maps link for Fancy Collection reviews
 * (trimmed from the long place URL — opens the business on Maps).
 */
export const GOOGLE_MAPS_REVIEW_URL = "https://maps.google.com/?cid=15184728439845652950";

const RETURN_REVIEW_THANKS =
  `Thank you for choosing us for your event. We can't wait to help you glam up again next time! ` +
  `If you enjoyed your experience, we'd love it if you could leave us a quick review here:\n` +
  GOOGLE_MAPS_REVIEW_URL;

/** Trailing block so Meta body variables are never at the end of the template. */
const SLIP_WA_CLOSING =
  `Your slip PDF is attached above.\n\n` +
  SLIP_WA_CONTACT_LINE;

function withFooter(body: string): string {
  return `${body}\n\n${SLIP_WA_CONTACT_LINE}\n\n${SLIP_WA_FOOTER}`;
}

export function dearCustomerLine(customerName?: string | null): string {
  const name = (customerName || "Customer").trim() || "Customer";
  return `Dear ${name},`;
}

export type BookingSlipDetailFields = {
  customerName: string;
  serialNo: string;
  pickupDate: string;
  pickupTime: string;
  returnDate: string;
  returnTime: string;
  totalDresses: string;
};

export type DeliverySlipDetailFields = {
  customerName: string;
  serialNo: string;
  returnDate: string;
  returnTime: string;
  /** Cumulative delivered dresses on the booking (active only). */
  totalDressesDelivered: string;
  /** Undelivered dresses still pending pickup (active only). Empty when none. */
  totalUncollectedDresses: string;
};

export type ReturnSlipDetailFields = {
  customerName: string;
};

export type IncompleteSlipDetailFields = {
  customerName: string;
  serialNo: string;
  returnDate: string;
  itemsPending: string;
};

export type PostponementHeldDetailFields = {
  customerName: string;
  serialNo: string;
  totalPaymentHeld: string;
  datePostponed: string;
  dateOfBooking: string;
};

/** Meta template body — booking confirmation ({{1}}…{{7}}). */
export const BOOKING_SLIP_TEMPLATE_BODY =
  `${THANK_YOU}\n\n` +
  `Dear {{1}},\n\n` +
  `✅ Booking Confirmed\n\n` +
  `🔖 Serial No: {{2}}\n` +
  `📅 Pickup Date: {{3}}\n` +
  `🕒 Pickup Time: {{4}}\n` +
  `📅 Return Date: {{5}}\n` +
  `🕒 Return Time: {{6}}\n` +
  `👗 Total Dresses: {{7}}\n\n` +
  SLIP_WA_CLOSING;

export const BOOKING_SLIP_TEMPLATE_EXAMPLE = [
  "Priya",
  "20",
  "11 Jul 2026",
  "11:00 AM",
  "14 Jul 2026",
  "06:00 PM",
  "3",
];

export const DELIVERY_SLIP_TEMPLATE_BODY =
  `${THANK_YOU}\n\n` +
  `Dear {{1}},\n\n` +
  `✅ Delivered Successfully\n\n` +
  `🔖 Serial No: {{2}}\n` +
  `👗 TOTAL DRESSES DELIVERED = {{3}}\n` +
  `{{4}}\n` +
  `📅 Return Date: {{5}}\n` +
  `🕒 Return Time: {{6}}\n\n` +
  SLIP_WA_CLOSING;

export const DELIVERY_SLIP_TEMPLATE_EXAMPLE = [
  "Priya",
  "20",
  "1",
  "📦 TOTAL UNCOLLECTED DRESSES = 1",
  "14 Jul 2026",
  "06:00 PM",
];

/** Return slip — Dear at top; no brand thank-you line; review CTA instead of detail fields. */
export const RETURN_SLIP_TEMPLATE_BODY =
  `Dear {{1}},\n\n` +
  `✅ Return Completed\n\n` +
  `${RETURN_REVIEW_THANKS}\n\n` +
  SLIP_WA_CLOSING;

export const RETURN_SLIP_TEMPLATE_EXAMPLE = ["Priya"];

export const INCOMPLETE_SLIP_TEMPLATE_BODY =
  `${THANK_YOU}\n\n` +
  `Dear {{1}},\n\n` +
  `⚠️ Incomplete Return Notice\n\n` +
  `Some item(s) for your booking were not fully returned. Please contact us to resolve this.\n\n` +
  `🔖 Serial No: {{2}}\n` +
  `📅 Return Date: {{3}}\n` +
  `📦 Items Pending: {{4}}\n\n` +
  SLIP_WA_CONTACT_LINE;

export const INCOMPLETE_SLIP_TEMPLATE_EXAMPLE = ["Priya", "20", "14 Jul 2026", "2"];

export const POSTPONEMENT_DATES_TEMPLATE_BODY =
  `${THANK_YOU}\n\n` +
  `📝 Booking Dates Updated\n\n` +
  `🔖 Serial No / Booking: {{1}}\n` +
  `📅 New Delivery Date: {{2}}\n` +
  `📅 New Return Date: {{3}}\n\n` +
  SLIP_WA_CONTACT_LINE;

export const POSTPONEMENT_DATES_TEMPLATE_EXAMPLE = [
  "BK-000001 / 20",
  "15 Jul 2026",
  "18 Jul 2026",
];

export const POSTPONEMENT_HELD_TEMPLATE_BODY =
  `${THANK_YOU}\n\n` +
  `⏸️ Booking Postponed\n\n` +
  `🔖 Serial No: {{1}}\n` +
  `💰 Total Payment Held: {{2}}\n` +
  `📅 Date Postponed: {{3}}\n` +
  `📅 Date of Booking: {{4}}\n\n` +
  `Your advance is held with us. Please contact us when you are ready to reschedule.\n\n` +
  SLIP_WA_CLOSING;

export const POSTPONEMENT_HELD_TEMPLATE_EXAMPLE = [
  "20",
  "₹5,000",
  "22 Jul 2026",
  "15 Jul 2026",
];

export const RETURN_DUE_REMINDER_TEMPLATE_BODY =
  `${THANK_YOU}\n\n` +
  `⏰ Return Reminder\n\n` +
  `🔖 Serial No / Booking: {{1}}\n` +
  `📅 Return Date: {{2}}\n` +
  `🕒 Return Time: {{3}}\n\n` +
  `Please return on time to avoid late charges.\n\n` +
  SLIP_WA_CONTACT_LINE;

export const RETURN_DUE_REMINDER_TEMPLATE_EXAMPLE = [
  "BK-000001 / 20",
  "18 Jul 2026",
  "06:00 PM",
];

function timeOrDash(timeLabel: string): string {
  return timeLabel.trim() || "-";
}

export function formatSlipDate(d: Date | string): string {
  return formatDate(d, "display");
}

export function bookingSlipDetailsFromBooking(booking: {
  customerName: string;
  monthlySerial: number;
  deliveryDate: Date;
  deliveryTime: string;
  returnDate: Date;
  returnTime: string;
  bookingItems?: unknown[];
}): BookingSlipDetailFields {
  return {
    customerName: booking.customerName || "Customer",
    serialNo: String(booking.monthlySerial).padStart(2, "0"),
    pickupDate: formatSlipDate(booking.deliveryDate),
    pickupTime: timeOrDash(booking.deliveryTime || ""),
    returnDate: formatSlipDate(booking.returnDate),
    returnTime: timeOrDash(booking.returnTime || ""),
    totalDresses: String(booking.bookingItems?.length ?? 0),
  };
}

export function deliverySlipDetailsFromBooking(booking: {
  customerName: string;
  monthlySerial: number;
  deliveryDate: Date;
  deliveryTime: string;
  returnDate: Date;
  returnTime: string;
  bookingItems?: Array<{
    isDelivered?: boolean;
    isCancelled?: boolean;
  }>;
}): DeliverySlipDetailFields {
  const items = booking.bookingItems ?? [];
  const active = items.filter((bi) => !bi.isCancelled);
  const delivered = active.filter((bi) => bi.isDelivered).length;
  const uncollected = active.filter((bi) => !bi.isDelivered).length;
  return {
    customerName: booking.customerName || "Customer",
    serialNo: String(booking.monthlySerial).padStart(2, "0"),
    returnDate: formatSlipDate(booking.returnDate),
    returnTime: timeOrDash(booking.returnTime || ""),
    totalDressesDelivered: String(delivered),
    totalUncollectedDresses: uncollected > 0 ? String(uncollected) : "",
  };
}

export function returnSlipDetailsFromBooking(booking: {
  customerName: string;
}): ReturnSlipDetailFields {
  return {
    customerName: booking.customerName || "Customer",
  };
}

export function incompleteSlipDetailsFromBooking(
  booking: {
    customerName: string;
    monthlySerial: number;
    returnDate: Date;
  },
  pendingCount: number,
): IncompleteSlipDetailFields {
  return {
    customerName: booking.customerName || "Customer",
    serialNo: String(booking.monthlySerial).padStart(2, "0"),
    returnDate: formatSlipDate(booking.returnDate),
    itemsPending: String(pendingCount),
  };
}

export function buildBookingSlipCaption(d: BookingSlipDetailFields): string {
  return withFooter(
    `${THANK_YOU}\n\n` +
      `${dearCustomerLine(d.customerName)}\n\n` +
      `✅ Booking Confirmed\n\n` +
      `🔖 Serial No: ${d.serialNo}\n` +
      `📅 Pickup Date: ${d.pickupDate}\n` +
      `🕒 Pickup Time: ${d.pickupTime}\n` +
      `📅 Return Date: ${d.returnDate}\n` +
      `🕒 Return Time: ${d.returnTime}\n` +
      `👗 Total Dresses: ${d.totalDresses}\n\n` +
      `Your slip PDF is attached above.`,
  );
}

export function buildDeliverySlipCaption(d: DeliverySlipDetailFields): string {
  const uncollectedLine =
    d.totalUncollectedDresses.trim() !== ""
      ? `📦 TOTAL UNCOLLECTED DRESSES = ${d.totalUncollectedDresses}\n`
      : "";
  return withFooter(
    `${THANK_YOU}\n\n` +
      `${dearCustomerLine(d.customerName)}\n\n` +
      `✅ Delivered Successfully\n\n` +
      `🔖 Serial No: ${d.serialNo}\n` +
      `👗 TOTAL DRESSES DELIVERED = ${d.totalDressesDelivered}\n` +
      uncollectedLine +
      `📅 Return Date: ${d.returnDate}\n` +
      `🕒 Return Time: ${d.returnTime}\n\n` +
      `Your slip PDF is attached above.`,
  );
}

export function buildReturnSlipCaption(d: ReturnSlipDetailFields): string {
  return withFooter(
    `${dearCustomerLine(d.customerName)}\n\n` +
      `✅ Return Completed\n\n` +
      `${RETURN_REVIEW_THANKS}\n\n` +
      `Your slip PDF is attached above.`,
  );
}

export function buildIncompleteSlipCaption(d: IncompleteSlipDetailFields): string {
  return withFooter(
    `${THANK_YOU}\n\n` +
      `${dearCustomerLine(d.customerName)}\n\n` +
      `⚠️ Incomplete Return Notice\n\n` +
      `Some item(s) for your booking were not fully returned. Please contact us to resolve this.\n\n` +
      `🔖 Serial No: ${d.serialNo}\n` +
      `📅 Return Date: ${d.returnDate}\n` +
      `📦 Items Pending: ${d.itemsPending}`,
  );
}

export function buildPostponementHeldCaption(d: PostponementHeldDetailFields): string {
  return withFooter(
    `${THANK_YOU}\n\n` +
      `${dearCustomerLine(d.customerName)}\n\n` +
      `⏸️ Booking Postponed\n\n` +
      `🔖 Serial No: ${d.serialNo}\n` +
      `💰 Total Payment Held: ${d.totalPaymentHeld}\n` +
      `📅 Date Postponed: ${d.datePostponed}\n` +
      `📅 Date of Booking: ${d.dateOfBooking}\n\n` +
      `Your advance is held with us. Please contact us when you are ready to reschedule.\n\n` +
      `Your slip PDF is attached above.`,
  );
}

export function postponementHeldDetailsFromBooking(booking: {
  customerName: string;
  monthlySerial: number;
  totalAdvance?: number | null;
  advance?: number | null;
  createdAt: Date;
  postponedAt?: Date | null;
}): PostponementHeldDetailFields {
  const held = booking.totalAdvance || booking.advance || 0;
  return {
    customerName: booking.customerName || "Customer",
    serialNo: String(booking.monthlySerial).padStart(2, "0"),
    totalPaymentHeld: `₹${formatInr(held)}`,
    datePostponed: formatSlipDate(booking.postponedAt ?? new Date()),
    dateOfBooking: formatSlipDate(booking.createdAt),
  };
}

export function postponementHeldBodyParams(d: PostponementHeldDetailFields): string[] {
  return [d.serialNo, d.totalPaymentHeld, d.datePostponed, d.dateOfBooking];
}

/** v4 = serial + payment held + dates; v3 legacy = serial/booking + delivery + return. */
export function postponementHeldBodyParamsForTemplate(
  templateName: string,
  d: PostponementHeldDetailFields,
  legacy?: { publicBookingId: string; deliveryDate: string; returnDate: string },
): string[] {
  const name = templateName.toLowerCase();
  if (name.includes("v4") || name.includes("v5")) return postponementHeldBodyParams(d);
  if (legacy) {
    return [
      `${legacy.publicBookingId} / ${d.serialNo}`,
      legacy.deliveryDate,
      legacy.returnDate,
    ];
  }
  return postponementHeldBodyParams(d);
}

export function bookingSlipBodyParams(d: BookingSlipDetailFields): string[] {
  return [
    d.customerName,
    d.serialNo,
    d.pickupDate,
    d.pickupTime,
    d.returnDate,
    d.returnTime,
    d.totalDresses,
  ];
}

/**
 * Meta DOCUMENT templates differ by version. Match body {{n}} count to the
 * approved template name (v4 = Dear + 7 vars; v3/v2 = 6 without Dear; pdf = 5).
 */
export function bookingSlipBodyParamsForTemplate(
  templateName: string,
  d: BookingSlipDetailFields,
): string[] {
  const name = templateName.toLowerCase();
  if (name.includes("v4")) return bookingSlipBodyParams(d);
  if (name.includes("pdf") && !name.includes("v")) {
    return [
      d.serialNo,
      d.pickupDate,
      d.pickupTime,
      `${d.returnDate} ${d.returnTime}`.trim(),
      d.totalDresses,
    ];
  }
  // booking_slip_v3 / v2 / unknown APPROVED DOCUMENT fallbacks
  return [
    d.serialNo,
    d.pickupDate,
    d.pickupTime,
    d.returnDate,
    d.returnTime,
    d.totalDresses,
  ];
}

export function deliverySlipBodyParams(d: DeliverySlipDetailFields): string[] {
  const uncollectedLine =
    d.totalUncollectedDresses.trim() !== ""
      ? `📦 TOTAL UNCOLLECTED DRESSES = ${d.totalUncollectedDresses}`
      : "All dresses delivered";
  return [
    d.customerName,
    d.serialNo,
    d.totalDressesDelivered,
    uncollectedLine,
    d.returnDate,
    d.returnTime,
  ];
}

/**
 * Meta DOCUMENT templates differ by version.
 * v5 = Dear + serial + delivered + uncollected + return date/time (6).
 * v4 = Dear + serial + return date/time + total dresses (5) — legacy.
 * v3 = serial + pickup date/time + return date/time + total (6) — legacy.
 */
export function deliverySlipBodyParamsForTemplate(
  templateName: string,
  d: DeliverySlipDetailFields & { pickupDate?: string; pickupTime?: string },
): string[] {
  const name = templateName.toLowerCase();
  if (name.includes("v5")) return deliverySlipBodyParams(d);
  if (name.includes("v4")) {
    // Legacy v4: customer, serial, return date, return time, total dresses
    return [
      d.customerName,
      d.serialNo,
      d.returnDate,
      d.returnTime,
      d.totalDressesDelivered,
    ];
  }
  // Legacy v3 / unknown: serial, pickup date, pickup time, return date, return time, total
  return [
    d.serialNo,
    d.pickupDate || "-",
    d.pickupTime || "-",
    d.returnDate,
    d.returnTime,
    d.totalDressesDelivered,
  ];
}

export function returnSlipBodyParams(d: ReturnSlipDetailFields): string[] {
  return [d.customerName];
}

/** v4 = Dear name only; v3 = serial + return date/time + total dresses. */
export function returnSlipBodyParamsForTemplate(
  templateName: string,
  d: ReturnSlipDetailFields & {
    serialNo: string;
    returnDate: string;
    returnTime: string;
    totalDresses: string;
  },
): string[] {
  const name = templateName.toLowerCase();
  if (name.includes("v4")) return returnSlipBodyParams(d);
  return [d.serialNo, d.returnDate, d.returnTime, d.totalDresses];
}

export function incompleteSlipBodyParams(d: IncompleteSlipDetailFields): string[] {
  return [d.customerName, d.serialNo, d.returnDate, d.itemsPending];
}

/** v4 includes Dear name; v3 is serial + return date + pending count. */
export function incompleteSlipBodyParamsForTemplate(
  templateName: string,
  d: IncompleteSlipDetailFields,
): string[] {
  const name = templateName.toLowerCase();
  if (name.includes("v4")) return incompleteSlipBodyParams(d);
  return [d.serialNo, d.returnDate, d.itemsPending];
}
