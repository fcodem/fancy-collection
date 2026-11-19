import "server-only";

import { formatDate } from "@/lib/constants";
import {
  PACKING_DIVISIONS,
  packingDivision,
  type PackingDivision,
} from "@/lib/packingDivision";
import { packingDivisionOrderLabel } from "@/lib/packingListSections";
import { getReturningToday } from "@/lib/services/operations";

export type AlternatePrintSide = {
  id: number;
  serial: string;
  customerName: string;
  address: string;
  contact: string;
  whatsapp: string;
  venue: string;
  deliveryDate: string;
  deliveryTime: string;
  returnDate: string;
  returnTime: string;
  totalRent: number;
  totalRemaining: number;
  remainingCollected: number;
  balanceLeft: number;
  securityDeposit: number;
  securityCollected: number;
  itemNotes: string;
  commonNotes: string;
  dresses: string[];
};

export type AlternatePrintRow = {
  id: number;
  categories: string[];
  deliveryNotes: string;
  returning: AlternatePrintSide;
  next: AlternatePrintSide | null;
};

export type AlternatePrintSection = {
  division: PackingDivision;
  label: string;
  rows: AlternatePrintRow[];
};

function displayDate(iso: string): string {
  const d = (iso || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return iso || "—";
  return formatDate(d, "display");
}

function mapSide(raw: {
  id: number;
  serial: number;
  customer_name: string;
  address: string;
  contact_1: string;
  whatsapp_no: string;
  venue: string;
  delivery_date: string;
  delivery_time: string;
  return_date: string;
  return_time: string;
  total_rent: number;
  total_remaining: number;
  remaining_collected: number;
  balance_remaining: number;
  security_deposit: number;
  security_collected: number;
  item_notes: string;
  common_notes: string;
  items: string[];
}): AlternatePrintSide {
  return {
    id: raw.id,
    serial: String(raw.serial || 0).padStart(2, "0"),
    customerName: raw.customer_name || "",
    address: raw.address || "",
    contact: raw.contact_1 || "",
    whatsapp: raw.whatsapp_no || "",
    venue: raw.venue || "",
    deliveryDate: displayDate(raw.delivery_date),
    deliveryTime: raw.delivery_time || "",
    returnDate: displayDate(raw.return_date),
    returnTime: raw.return_time || "",
    totalRent: raw.total_rent || 0,
    totalRemaining: raw.total_remaining || 0,
    remainingCollected: raw.remaining_collected || 0,
    balanceLeft: raw.balance_remaining || 0,
    securityDeposit: raw.security_deposit || 0,
    securityCollected: raw.security_collected || 0,
    itemNotes: raw.item_notes || "",
    commonNotes: raw.common_notes || "",
    dresses: Array.isArray(raw.items) ? raw.items : [],
  };
}

function rowDivision(row: AlternatePrintRow): PackingDivision {
  for (const cat of row.categories) {
    const div = packingDivision(cat, row.returning.dresses.join(" "));
    if (div) return div;
  }
  for (const dress of row.returning.dresses) {
    return packingDivision("", dress);
  }
  return "womens";
}

export async function loadAlternatePrintList(dateIso: string): Promise<{
  dateIso: string;
  dateLabel: string;
  rows: AlternatePrintRow[];
  sections: AlternatePrintSection[];
}> {
  const raw = await getReturningToday(dateIso);
  const rows: AlternatePrintRow[] = raw.map((r) => ({
    id: r.id,
    categories: Array.isArray(r.item_categories) ? r.item_categories.filter(Boolean) : [],
    deliveryNotes: r.delivery_notes || "",
    returning: mapSide(r),
    next: r.next_booking ? mapSide(r.next_booking) : null,
  }));

  const sections = PACKING_DIVISIONS.map((div) => ({
    division: div.key,
    label: packingDivisionOrderLabel(div.key),
    rows: rows.filter((row) => rowDivision(row) === div.key),
  })).filter((s) => s.rows.length > 0);

  return {
    dateIso,
    dateLabel: displayDate(dateIso),
    rows,
    sections,
  };
}
