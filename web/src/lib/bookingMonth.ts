/** UTC calendar-month helpers for booking list month section headers. */

function toUtcDate(d: Date | string): Date | null {
  if (d instanceof Date) {
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const s = d.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const date = new Date(`${s.slice(0, 10)}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  // Display strings from formatDate(..., "display"), e.g. "11 Jul 2026" (UTC calendar day)
  const withUtc = new Date(`${s} UTC`);
  if (!Number.isNaN(withUtc.getTime())) return withUtc;
  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function bookingMonthKey(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = toUtcDate(d);
  if (!date) return "";
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function formatBookingMonthLabel(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = toUtcDate(d);
  if (!date) return "";
  return date.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** Inclusive YYYY-MM-DD from/to for the UTC calendar month containing `dateStr`. */
export function calendarMonthRangeFromDate(dateStr: string): { from: string; to: string } {
  const raw = dateStr.slice(0, 10);
  const [y, m] = raw.split("-").map(Number);
  const year = y || new Date().getUTCFullYear();
  const month = m || new Date().getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, "0");
  return {
    from: `${year}-${mm}-01`,
    to: `${year}-${mm}-${String(lastDay).padStart(2, "0")}`,
  };
}
