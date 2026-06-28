import { formatDate } from "@/lib/constants";

export const SLIP_BRAND_NAME = "Team Fancy Collection";
export const SLIP_TAGLINE = "Premium Cloth Rental";

export const SLIP_GREEN = "#1a5c2a";
export const SLIP_GOLD = "#c9a84c";
export const SLIP_LIGHT_GREEN = "#f0faf3";
export const SLIP_SUCCESS = "#27ae60";
export const SLIP_DARK = "#1a1a1a";
export const SLIP_GREY = "#555555";
export const SLIP_BORDER = "#e0e0e0";
export const SLIP_RED = "#c0392b";
export const SLIP_AMBER = "#f39c12";
export const SLIP_BLUE = "#1565c0";

export const SLIP_DEFAULT_ADDRESS =
  "Banwata Ganj Near Balaji Mandir Court Road Moradabad 244001";
export const SLIP_DEFAULT_PHONE = "8077843874, 8630834711";

export const SLIP_TERMS = [
  "Goods once booked CANNOT be cancelled under any circumstances.",
  "Booking advance amount is NOT adjustable in any other bookings.",
  "All items must be returned by the return date and time mentioned above.",
  "Late returns will attract additional rental charges per day.",
  "Any damage, stains, tears or loss to the rented items is chargeable.",
  "Security deposit will be refunded ONLY upon return of all items in original condition.",
  "Items will be handed over to the registered customer with valid photo ID only.",
  "Team Fancy Collection is not responsible for any alterations done outside our premises.",
  "In case of any dispute, the decision of Team Fancy Collection management shall be final.",
  "Customer is responsible for proper storage and care of items during rental period.",
];

export function slipRs(n: number) {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

export function slipPadSerial(n: number) {
  return String(n).padStart(2, "0");
}

export function formatSlipDateTime(d: Date | string | null | undefined): {
  date: string;
  time: string;
} {
  if (!d) return { date: "—", time: "" };
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return { date: "—", time: "" };
  return {
    date: dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
    time: dt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }),
  };
}

/** Late only when returned on a calendar day after the scheduled return date (time ignored). */
export function isLateReturn(
  returnedAt: Date | null | undefined,
  returnDate: Date,
): boolean {
  if (!returnedAt) return false;
  const returnedDay = formatDate(returnedAt, "iso");
  const dueDay = formatDate(returnDate, "iso");
  return returnedDay > dueDay;
}

export type ReturnCondition = "good" | "damaged" | "stained";

export function itemReturnCondition(item: {
  isIncompleteReturn?: boolean;
  itemIncompleteNotes?: string | null;
}): ReturnCondition {
  if (!item.isIncompleteReturn) return "good";
  const notes = (item.itemIncompleteNotes || "").toLowerCase();
  if (notes.includes("stain")) return "stained";
  return "damaged";
}
