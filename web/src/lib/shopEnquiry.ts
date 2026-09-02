import { formatDate, parseDate } from "@/lib/constants";

export type ShopEnquiryInput = {
  customer_name?: string;
  customer_address?: string | null;
  contact_1?: string | null;
  whatsapp_no?: string | null;
  enquiry_notes?: string | null;
  staff_names?: string[];
  visit_date?: string;
  /** @deprecated use delivery_dates */
  dress_needed_date?: string | null;
  delivery_dates?: string[] | null;
};

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseOptionalEnquiryDate(value: string | null | undefined): Date | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return parseDate(trimmed.slice(0, 10));
}

export function parseDeliveryDatesJson(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return normalizeDeliveryDatesInput(parsed.map((d) => String(d)));
  } catch {
    return [];
  }
}

export function normalizeDeliveryDatesInput(dates: string[] | null | undefined): string[] {
  if (!dates?.length) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of dates) {
    const iso = raw?.trim().slice(0, 10) ?? "";
    if (!ISO_DATE_RE.test(iso) || seen.has(iso)) continue;
    seen.add(iso);
    out.push(iso);
  }
  return out.sort();
}

export function deliveryDatesFromRow(row: {
  deliveryDates?: string | null;
  dressNeededDate?: Date | null;
}): string[] {
  const fromJson = parseDeliveryDatesJson(row.deliveryDates);
  if (fromJson.length) return fromJson;
  if (row.dressNeededDate) return [formatDate(row.dressNeededDate, "iso")];
  return [];
}

export function serializeShopEnquiry(row: {
  id: number;
  customerName: string;
  customerAddress: string | null;
  contact1: string | null;
  whatsappNo: string | null;
  enquiryNotes: string | null;
  staffNames: string | null;
  visitDate: Date;
  dressNeededDate: Date | null;
  deliveryDates?: string | null;
  createdAt: Date;
}) {
  const delivery_dates = deliveryDatesFromRow(row);
  return {
    id: row.id,
    customer_name: row.customerName,
    customer_address: row.customerAddress,
    contact_1: row.contact1,
    whatsapp_no: row.whatsappNo,
    enquiry_notes: row.enquiryNotes,
    staff_names: row.staffNames ? row.staffNames.split(", ") : [],
    visit_date: formatDate(row.visitDate, "iso"),
    dress_needed_date: delivery_dates[0] ?? null,
    delivery_dates,
    created_at: row.createdAt.toISOString(),
  };
}

export function shopEnquiryWriteData(body: ShopEnquiryInput) {
  const deliveryDates = normalizeDeliveryDatesInput(
    body.delivery_dates ??
      (body.dress_needed_date ? [body.dress_needed_date] : []),
  );
  return {
    customerName: body.customer_name!.trim(),
    customerAddress: null,
    contact1: body.contact_1?.trim() || null,
    whatsappNo: body.whatsapp_no?.trim() || null,
    enquiryNotes: body.enquiry_notes?.trim() || null,
    staffNames:
      Array.isArray(body.staff_names) && body.staff_names.length
        ? body.staff_names.join(", ")
        : null,
    visitDate: body.visit_date
      ? parseDate(body.visit_date.slice(0, 10))
      : new Date(),
    deliveryDates: deliveryDates.length ? JSON.stringify(deliveryDates) : null,
    dressNeededDate: deliveryDates.length ? parseDate(deliveryDates[0]) : null,
  };
}
