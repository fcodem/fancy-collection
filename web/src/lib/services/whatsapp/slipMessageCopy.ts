import { formatDate } from "@/lib/constants";
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
  totalDresses: string;
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
  `📅 Return Date: {{3}}\n` +
  `🕒 Return Time: {{4}}\n` +
  `👗 Total Dresses: {{5}}\n\n` +
  SLIP_WA_CLOSING;

export const DELIVERY_SLIP_TEMPLATE_EXAMPLE = [
  "Priya",
  "20",
  "14 Jul 2026",
  "06:00 PM",
  "3",
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
  `🔖 Serial No / Booking: {{1}}\n` +
  `📅 Scheduled Delivery: {{2}}\n` +
  `📅 Scheduled Return: {{3}}\n\n` +
  `Your advance is held with us. Please contact us when you are ready to reschedule.\n\n` +
  SLIP_WA_CONTACT_LINE;

export const POSTPONEMENT_HELD_TEMPLATE_EXAMPLE = [
  "BK-000001 / 20",
  "20 Jul 2026",
  "23 Jul 2026",
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
  bookingItems?: unknown[];
}): DeliverySlipDetailFields {
  const d = bookingSlipDetailsFromBooking(booking);
  return {
    customerName: d.customerName,
    serialNo: d.serialNo,
    returnDate: d.returnDate,
    returnTime: d.returnTime,
    totalDresses: d.totalDresses,
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
  return withFooter(
    `${THANK_YOU}\n\n` +
      `${dearCustomerLine(d.customerName)}\n\n` +
      `✅ Delivered Successfully\n\n` +
      `🔖 Serial No: ${d.serialNo}\n` +
      `📅 Return Date: ${d.returnDate}\n` +
      `🕒 Return Time: ${d.returnTime}\n` +
      `👗 Total Dresses: ${d.totalDresses}\n\n` +
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

export function deliverySlipBodyParams(d: DeliverySlipDetailFields): string[] {
  return [d.customerName, d.serialNo, d.returnDate, d.returnTime, d.totalDresses];
}

export function returnSlipBodyParams(d: ReturnSlipDetailFields): string[] {
  return [d.customerName];
}

export function incompleteSlipBodyParams(d: IncompleteSlipDetailFields): string[] {
  return [d.customerName, d.serialNo, d.returnDate, d.itemsPending];
}
