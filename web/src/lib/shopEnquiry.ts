import { formatDate, parseDate } from "@/lib/constants";

export type ShopEnquiryInput = {
  customer_name?: string;
  customer_address?: string | null;
  contact_1?: string | null;
  whatsapp_no?: string | null;
  enquiry_notes?: string | null;
  staff_names?: string[];
  visit_date?: string;
  dress_needed_date?: string | null;
};

export function parseOptionalEnquiryDate(value: string | null | undefined): Date | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return parseDate(trimmed.slice(0, 10));
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
  createdAt: Date;
}) {
  return {
    id: row.id,
    customer_name: row.customerName,
    customer_address: row.customerAddress,
    contact_1: row.contact1,
    whatsapp_no: row.whatsappNo,
    enquiry_notes: row.enquiryNotes,
    staff_names: row.staffNames ? row.staffNames.split(", ") : [],
    visit_date: formatDate(row.visitDate, "iso"),
    dress_needed_date: row.dressNeededDate ? formatDate(row.dressNeededDate, "iso") : null,
    created_at: row.createdAt.toISOString(),
  };
}

export function shopEnquiryWriteData(body: ShopEnquiryInput) {
  return {
    customerName: body.customer_name!.trim(),
    customerAddress: body.customer_address?.trim() || null,
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
    dressNeededDate: parseOptionalEnquiryDate(body.dress_needed_date),
  };
}
