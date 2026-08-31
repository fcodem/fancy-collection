const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Booking times are free-text like "11:00 AM", "12:00 Noon", "4:30 PM".
 * Returns minutes since midnight, or null when the value cannot be trusted.
 */
export function parseBookingTimeToMinutes(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const match = raw
    .trim()
    .toUpperCase()
    .match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM|NOON|MIDNIGHT)?$/);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? "0");
  const suffix = match[3];
  if (minutes > 59) return null;
  if (suffix === "NOON") {
    if (hours !== 12) return null;
    hours = 12;
  } else if (suffix === "MIDNIGHT") {
    if (hours !== 12) return null;
    hours = 0;
  } else if (suffix === "AM") {
    if (hours < 1 || hours > 12) return null;
    if (hours === 12) hours = 0;
  } else if (suffix === "PM") {
    if (hours < 1 || hours > 12) return null;
    if (hours !== 12) hours += 12;
  } else if (hours > 23) {
    return null;
  }
  return hours * 60 + minutes;
}

/** Combine booking-form date + time into an ISO-like local datetime string. */
export function buildKolkataDateTimeFromBookingForm(
  date: string,
  time: string | undefined,
): string {
  const dateOnly = date.trim().slice(0, 10);
  if (!DATE_ONLY_RE.test(dateOnly)) return date.trim();
  const minutes = parseBookingTimeToMinutes(time);
  if (minutes == null) return dateOnly;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${dateOnly}T${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}
