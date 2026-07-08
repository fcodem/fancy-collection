import { dressDisplayName } from "./dress";
import { digitsOnly } from "./phone";

export type StatListBooking = {
  id: number;
  monthlySerial: number;
  customerName: string;
  contact1?: string;
  whatsappNo?: string | null;
  status: string;
  dressName?: string | null;
  bookingItems: Array<{ dressName: string; category?: string | null; size?: string | null; notes?: string | null }>;
  legacyItem?: { category?: string | null; size?: string | null } | null;
};

function dressText(b: StatListBooking): string {
  if (b.bookingItems?.length) {
    return b.bookingItems.map((bi) => dressDisplayName(bi.dressName, bi.category, bi.size)).join(" ");
  }
  return b.dressName || "";
}

export function bookingCategories(b: StatListBooking): string[] {
  if (b.bookingItems?.length) {
    return [...new Set(b.bookingItems.map((bi) => (bi.category || "").trim()).filter(Boolean))];
  }
  const cat = b.legacyItem?.category?.trim();
  return cat ? [cat] : [];
}

export function matchesCategory(b: StatListBooking, category: string): boolean {
  if (!category.trim()) return true;
  const want = category.trim().toLowerCase();
  return bookingCategories(b).some((c) => c.toLowerCase() === want);
}

/** Client-side search scoped to a list — mirrors dashboard quick search fields. */
export function matchesSearch(b: StatListBooking, query: string): boolean {
  const q = query.trim();
  if (!q) return true;

  const qLower = q.toLowerCase();
  const words = qLower.split(/\s+/).filter(Boolean);

  if (/^\d+$/.test(q)) {
    const serial = String(b.monthlySerial).padStart(2, "0");
    if (serial.includes(q) || String(b.monthlySerial).includes(q)) return true;
    const phone = digitsOnly(`${b.contact1 || ""}${b.whatsappNo || ""}`);
    const qDigits = digitsOnly(q);
    if (qDigits && phone.includes(qDigits)) return true;
  }

  if (words.length && words.every((w) => b.customerName.toLowerCase().includes(w))) {
    return true;
  }

  const dresses = dressText(b).toLowerCase();
  if (words.length && words.every((w) => dresses.includes(w))) {
    return true;
  }

  const qDigits = digitsOnly(q);
  if (qDigits.length >= 4) {
    const phone = digitsOnly(`${b.contact1 || ""}${b.whatsappNo || ""}`);
    if (phone.includes(qDigits)) return true;
  }

  return false;
}

export function filterStatListBookings<T extends StatListBooking>(
  bookings: T[],
  query: string,
  category: string
): T[] {
  return bookings.filter((b) => matchesCategory(b, category) && matchesSearch(b, query));
}
