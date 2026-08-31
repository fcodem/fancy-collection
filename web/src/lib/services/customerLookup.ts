import { Prisma } from "@prisma/client";
import prisma, { isSqliteDb } from "@/lib/prisma";

export type CustomerLookupRow = {
  customer_name: string;
  customer_address: string;
  contact_1: string;
  whatsapp_no: string;
  venue: string;
};

const BOOKING_SELECT = {
  customerName: true,
  customerAddress: true,
  contact1: true,
  whatsappNo: true,
  venue: true,
} as const;

type BookingPick = Prisma.BookingGetPayload<{ select: typeof BOOKING_SELECT }>;

function mapBooking(b: BookingPick): CustomerLookupRow {
  return {
    customer_name: b.customerName,
    customer_address: b.customerAddress,
    contact_1: b.contact1,
    whatsapp_no: b.whatsappNo || "",
    venue: b.venue || "",
  };
}

function dedupeByPhone(bookings: BookingPick[], limit: number): CustomerLookupRow[] {
  const seen = new Map<string, BookingPick>();
  for (const b of bookings) {
    const key =
      b.contact1.replace(/\D/g, "").slice(-10) || b.contact1.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.set(key, b);
    if (seen.size >= limit) break;
  }
  return [...seen.values()].map(mapBooking);
}

/** Latest unique customers by phone (fast path for empty search). */
export async function lookupRecentCustomers(limit = 20): Promise<CustomerLookupRow[]> {
  if (!isSqliteDb()) {
    const rows = await prisma.$queryRaw<
      Array<{
        customer_name: string;
        customer_address: string;
        contact_1: string;
        whatsapp_no: string | null;
        venue: string | null;
      }>
    >`
      SELECT customer_name, customer_address, contact_1, whatsapp_no, venue
      FROM (
        SELECT
          customer_name,
          customer_address,
          contact_1,
          whatsapp_no,
          venue,
          created_at,
          ROW_NUMBER() OVER (
            PARTITION BY COALESCE(
              NULLIF(RIGHT(REGEXP_REPLACE(contact_1, '\\D', '', 'g'), 10), ''),
              LOWER(TRIM(contact_1))
            )
            ORDER BY created_at DESC
          ) AS rn
        FROM bookings
        WHERE TRIM(contact_1) <> ''
      ) deduped
      WHERE rn = 1
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    return rows.map((b) => ({
      customer_name: b.customer_name,
      customer_address: b.customer_address,
      contact_1: b.contact_1,
      whatsapp_no: b.whatsapp_no || "",
      venue: b.venue || "",
    }));
  }

  const bookings = await prisma.booking.findMany({
    select: BOOKING_SELECT,
    orderBy: { createdAt: "desc" },
    take: limit * 2,
  });
  return dedupeByPhone(bookings, limit);
}

export async function searchCustomers(q: string, limit = 20): Promise<CustomerLookupRow[]> {
  const trimmed = q.trim();
  if (trimmed.length < 2) return [];

  const isDigits = /^\d+$/.test(trimmed);
  const where: Prisma.BookingWhereInput = isDigits
    ? {
        OR: [
          { contact1: { startsWith: trimmed, mode: "insensitive" } },
          { whatsappNo: { startsWith: trimmed, mode: "insensitive" } },
          { contact1: { contains: trimmed, mode: "insensitive" } },
          { whatsappNo: { contains: trimmed, mode: "insensitive" } },
        ],
      }
    : {
        AND: trimmed.split(/\s+/).filter(Boolean).map((w) => ({
          customerName: { contains: w, mode: "insensitive" as const },
        })),
      };

  const bookings = await prisma.booking.findMany({
    where,
    select: BOOKING_SELECT,
    orderBy: { createdAt: "desc" },
    take: limit * 2,
  });
  return dedupeByPhone(bookings, limit);
}
