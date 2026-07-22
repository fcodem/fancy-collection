/**
 * Meta template names currently used by the app (keep these).
 * Everything else that looks like an old slip/notice template is safe to delete.
 */
export const ACTIVE_WHATSAPP_TEMPLATE_NAMES = new Set([
  "booking_slip_v4",
  "delivery_slip_v5",
  "delivery_slip_v4",
  "delivery_slip_v3",
  "return_slip_v4",
  "incomplete_return_v4",
  "booking_dates_v3",
  "booking_cancelled_v1",
  "booking_held_v3",
  "return_due_v3",
  "festive_offer",
  "new_collection",
  "wedding_season_offer",
  "customer_thank_you",
  "hello_world",
]);

/** Known obsolete names from prior redesigns (URL-era, v1/v2/v3, etc.). */
export const LEGACY_WHATSAPP_TEMPLATE_NAMES = [
  "booking_slip_details",
  "booking_slip_pdf",
  "booking_slip_v2",
  "booking_slip_v3",
  "booking_confirmation",
  "delivery_slip_details",
  "delivery_slip_v2",
  "delivery_slip",
  "return_slip_details",
  "return_slip_v2",
  "return_slip_v3",
  "return_slip",
  "incomplete_return_details",
  "incomplete_return_v2",
  "incomplete_return_v3",
  "incomplete_return_slip",
  "booking_dates_updated",
  "booking_dates_v2",
  "booking_held_notice",
  "booking_held_v2",
  "return_due_reminder",
  "return_due_v2",
  "booking_postponed",
  "postponement_held",
  "return_reminder",
] as const;

export function isLegacyWhatsAppTemplateName(name: string): boolean {
  const n = name.trim().toLowerCase();
  if (ACTIVE_WHATSAPP_TEMPLATE_NAMES.has(n)) return false;
  if ((LEGACY_WHATSAPP_TEMPLATE_NAMES as readonly string[]).includes(n)) return true;
  // Heuristic: older slip/notice versions
  if (/_(v1|v2|details|pdf)$/.test(n) && !ACTIVE_WHATSAPP_TEMPLATE_NAMES.has(n)) return true;
  if (
    /^(booking_slip|delivery_slip|return_slip|incomplete_return|booking_dates|booking_held|return_due)_/.test(
      n,
    ) &&
    !ACTIVE_WHATSAPP_TEMPLATE_NAMES.has(n)
  ) {
    return true;
  }
  return false;
}
