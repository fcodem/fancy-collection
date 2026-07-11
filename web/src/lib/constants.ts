export const BASE_MENS = ["Sherwani", "Indowestern", "Jodhpuri", "Coat Suit", "Suit", "Blazer", "Kurta"];
export const BASE_WOMENS = ["Saree", "Lehenga", "Gown"];
export const BASE_JEWELLERY = [
  "Jewellery",
  "Kundan Jewellery",
  "Jerkan Jewellery",
  "Polki Jewellery",
  "AD Jewellery",
  "Bridal Jewellery",
  "Necklace",
  "Bangles",
  "Earrings",
  "Maang Tikka",
  "Haath Phool",
  "Anklet",
  "Nose Ring",
  "Matha Patti",
];
export const BASE_ACCESSORY = ["Accessory", "Dupatta", "Belt", "Clutch", "Crown/Tiara"];
export const SIZES = [...Array.from({ length: 14 }, (_, i) => String(32 + i * 2)), "Free Size", "Custom"];
export const SUB_CATEGORIES = ["Premium", "Normal", "Cheap"];
export const PAYMENT_METHODS = ["cash", "card", "upi", "bank"];
export const LOGIN_REQUEST_TTL_MINUTES = 30;
export const ALLOWED_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif"];

export const MENS_CATEGORIES = BASE_MENS;
export const WOMENS_CATEGORIES = BASE_WOMENS;
export const JEWELLERY_CATEGORIES = BASE_JEWELLERY;
export const ACCESSORY_CATEGORIES = BASE_ACCESSORY;

export function formatDate(d: Date | string, style: "iso" | "display" = "iso"): string {
  const date = typeof d === "string" ? parseDate(d.slice(0, 10)) : d;
  if (style === "iso") {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** When the booking record was created (matches booking form clock style). */
export function formatBookingDateTime(d: Date | string): { date: string; time: string } {
  const dt = typeof d === "string" ? new Date(d) : d;
  return {
    date: dt.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }),
    time: dt.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }),
  };
}

export function localTodayStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function localTodayEnd(): Date {
  const end = localTodayStart();
  end.setDate(end.getDate() + 1);
  return end;
}

export function todayIso(): string {
  const t = localTodayStart();
  const m = String(t.getMonth() + 1).padStart(2, "0");
  const d = String(t.getDate()).padStart(2, "0");
  return `${t.getFullYear()}-${m}-${d}`;
}

/** True when calendar date (YYYY-MM-DD) is strictly before today (local). */
export function isDateBeforeToday(dateStr: string): boolean {
  return dateStr.slice(0, 10) < todayIso();
}

/** Rejects pickup/delivery and return dates before today. */
export function assertBookingDatesNotPast(deliveryDateStr: string, returnDateStr: string): void {
  const delivery = deliveryDateStr.slice(0, 10);
  const returnDate = returnDateStr.slice(0, 10);
  const today = todayIso();
  if (delivery < today) {
    throw new Error("Pickup (delivery) date cannot be before today.");
  }
  if (returnDate < today) {
    throw new Error("Return date cannot be before today.");
  }
}

export function todayMonthIso(): string {
  return todayIso().slice(0, 7);
}

export function monthStartIso(fromToday?: string): string {
  const t = fromToday || todayIso();
  return `${t.slice(0, 7)}-01`;
}

export function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

export function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export function endOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
}
