/**
 * Restore bookings + booking_items (+ clothing_items they reference) from pg_dump.
 * Data-only — does not change schema.
 *
 * Usage: npx tsx scripts/restore-bookings-from-sql-dump.ts [path-to.sql]
 */
import { readFileSync } from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type ParsedCopy = { columns: string[]; rows: string[][] };

function parseCopyBlock(sql: string, table: string): ParsedCopy | null {
  const re = new RegExp(
    `COPY public\\.${table} \\(([^)]+)\\) FROM stdin;\\n([\\s\\S]*?)\\n\\\\.`,
  );
  const m = sql.match(re);
  if (!m) return null;

  const columns = m[1].split(",").map((c) => c.trim());
  const rows = m[2]
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => line.split("\t"));

  return { columns, rows };
}

function cell(v: string): unknown {
  if (v === "\\N") return null;
  return v;
}

function rowToObject(columns: string[], values: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (let i = 0; i < columns.length; i++) {
    out[columns[i]] = cell(values[i] ?? "\\N");
  }
  return out;
}

function num(v: unknown, fallback = 0): number {
  if (v == null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function bool(v: unknown, fallback = false): boolean {
  if (v == null) return fallback;
  if (typeof v === "boolean") return v;
  const s = String(v).toLowerCase();
  if (s === "t" || s === "true" || s === "1") return true;
  if (s === "f" || s === "false" || s === "0") return false;
  return fallback;
}

function date(v: unknown): Date | null {
  if (v == null || v === "") return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

function dateReq(v: unknown): Date {
  const d = date(v);
  if (!d) throw new Error(`Invalid date: ${v}`);
  return d;
}

async function upsertClothingItem(row: Record<string, unknown>) {
  const id = num(row.id);
  const data = {
    name: String(row.name ?? ""),
    sku: String(row.sku ?? ""),
    category: String(row.category ?? ""),
    size: row.size != null ? String(row.size) : null,
    color: row.color != null ? String(row.color) : null,
    dailyRate: num(row.daily_rate),
    deposit: num(row.deposit),
    status: String(row.status ?? "available"),
    itemType: String(row.item_type ?? "clothing"),
    photo: row.photo != null ? String(row.photo) : null,
    conditionNotes: row.condition_notes != null ? String(row.condition_notes) : null,
    createdAt: date(row.created_at) ?? new Date(),
    subCategory: row.sub_category != null ? String(row.sub_category) : null,
  };

  await prisma.clothingItem.upsert({
    where: { id },
    create: { id, ...data },
    update: data,
  });
}

async function upsertBooking(row: Record<string, unknown>) {
  const id = num(row.id);
  const data = {
    bookingNumber: String(row.booking_number ?? ""),
    monthlySerial: num(row.monthly_serial),
    customerName: String(row.customer_name ?? ""),
    customerAddress: String(row.customer_address ?? ""),
    contact1: String(row.contact_1 ?? ""),
    whatsappNo: row.whatsapp_no != null ? String(row.whatsapp_no) : null,
    deliveryDate: dateReq(row.delivery_date),
    deliveryTime: String(row.delivery_time ?? ""),
    returnDate: dateReq(row.return_date),
    returnTime: String(row.return_time ?? ""),
    venue: row.venue != null ? String(row.venue) : null,
    securityDeposit: num(row.security_deposit),
    totalPrice: num(row.total_price),
    totalAdvance: num(row.total_advance),
    totalRemaining: num(row.total_remaining),
    advancePaymentMode: String(row.advance_payment_mode ?? "cash"),
    remainingPaymentMode:
      row.remaining_payment_mode != null ? String(row.remaining_payment_mode) : null,
    securityPaymentMode:
      row.security_payment_mode != null ? String(row.security_payment_mode) : null,
    commonNotes: row.common_notes != null ? String(row.common_notes) : null,
    staffNames: row.staff_names != null ? String(row.staff_names) : null,
    status: String(row.status ?? "booked"),
    createdAt: date(row.created_at) ?? new Date(),
    deliveryNotes: row.delivery_notes != null ? String(row.delivery_notes) : null,
    remainingCollected: num(row.remaining_collected),
    securityCollected: num(row.security_collected),
    deliveredAt: date(row.delivered_at),
    returnedAt: date(row.returned_at),
    incompleteNotes: row.incomplete_notes != null ? String(row.incomplete_notes) : null,
    incompletePhoto: row.incomplete_photo != null ? String(row.incomplete_photo) : null,
    idPhoto1: row.id_photo_1 != null ? String(row.id_photo_1) : null,
    idPhoto2: row.id_photo_2 != null ? String(row.id_photo_2) : null,
    securityHeld: num(row.security_held),
    itemId: row.item_id != null ? num(row.item_id) : null,
    dressName: row.dress_name != null ? String(row.dress_name) : null,
    price: num(row.price),
    advance: num(row.advance),
    remaining: num(row.remaining),
    notes: row.notes != null ? String(row.notes) : null,
    contact2: row.contact_2 != null ? String(row.contact_2) : null,
    qrToken: row.qr_token != null ? String(row.qr_token) : null,
    refundAmount: num(row.refund_amount),
    refundedAt: date(row.refunded_at),
    postponedAt: date(row.postponed_at),
    publicBookingId: row.public_booking_id != null ? String(row.public_booking_id) : null,
    qrCodeUrl: row.qr_code_url != null ? String(row.qr_code_url) : null,
    whatsappStatus: row.whatsapp_status != null ? String(row.whatsapp_status) : null,
    whatsappSentAt: date(row.whatsapp_sent_at),
    whatsappError: row.whatsapp_error != null ? String(row.whatsapp_error) : null,
  };

  await prisma.booking.upsert({
    where: { id },
    create: { id, ...data },
    update: data,
  });
}

async function upsertBookingItem(row: Record<string, unknown>) {
  const id = num(row.id);
  const data = {
    bookingId: num(row.booking_id),
    itemId: num(row.item_id),
    dressName: String(row.dress_name ?? ""),
    category: row.category != null ? String(row.category) : null,
    price: num(row.price),
    advance: num(row.advance),
    remaining: num(row.remaining),
    size: row.size != null ? String(row.size) : null,
    notes: row.notes != null ? String(row.notes) : null,
    preparedBy: row.prepared_by != null ? String(row.prepared_by) : null,
    checkedBy: row.checked_by != null ? String(row.checked_by) : null,
    isPackedReady: bool(row.is_packed_ready),
    packingNote: row.packing_note != null ? String(row.packing_note) : null,
    isDelivered: bool(row.is_delivered),
    deliveredAt: date(row.delivered_at),
    itemRemainingCollected: num(row.item_remaining_collected),
    itemSecurityCollected: num(row.item_security_collected),
    itemDeliveryNotes:
      row.item_delivery_notes != null ? String(row.item_delivery_notes) : null,
    isReturned: bool(row.is_returned),
    isIncompleteReturn: bool(row.is_incomplete_return),
    itemIncompleteNotes:
      row.item_incomplete_notes != null ? String(row.item_incomplete_notes) : null,
    itemIncompletePhoto:
      row.item_incomplete_photo != null ? String(row.item_incomplete_photo) : null,
    itemSecurityHeld: num(row.item_security_held),
  };

  await prisma.bookingItem.upsert({
    where: { id },
    create: { id, ...data },
    update: data,
  });
}

async function resetSequence(table: string, column = "id") {
  await prisma.$executeRawUnsafe(`
    SELECT setval(
      pg_get_serial_sequence('${table}', '${column}'),
      COALESCE((SELECT MAX("${column}") FROM "${table}"), 1)
    );
  `);
}

async function main() {
  const dumpPath =
    process.argv[2] ||
    path.join(process.cwd(), "..", "db-backups", "cloth_rental_pre_whatsapp_jobs_20260627_125552.sql");

  console.log("Reading backup:", dumpPath);
  const sql = readFileSync(dumpPath, "utf8");

  const clothing = parseCopyBlock(sql, "clothing_items");
  const bookings = parseCopyBlock(sql, "bookings");
  const bookingItems = parseCopyBlock(sql, "booking_items");

  if (!bookings) throw new Error("No bookings COPY block found in dump");

  const bookingRows = bookings.rows.map((r) => rowToObject(bookings.columns, r));
  const itemRows = bookingItems?.rows.map((r) => rowToObject(bookingItems.columns, r)) ?? [];
  const clothingRows = clothing?.rows.map((r) => rowToObject(clothing.columns, r)) ?? [];

  const neededItemIds = new Set(itemRows.map((r) => num(r.item_id)));
  const clothingToRestore = clothingRows.filter((r) => neededItemIds.has(num(r.id)));

  console.log(
    `Restoring ${bookingRows.length} bookings, ${itemRows.length} booking items, ${clothingToRestore.length} inventory items (for dress links)...`,
  );

  for (const row of clothingToRestore) {
    await upsertClothingItem(row);
  }

  for (const row of bookingRows) {
    await upsertBooking(row);
  }

  for (const row of itemRows) {
    await upsertBookingItem(row);
  }

  await resetSequence("clothing_items");
  await resetSequence("bookings");
  await resetSequence("booking_items");

  const [b, bi, ci] = await Promise.all([
    prisma.booking.count(),
    prisma.bookingItem.count(),
    prisma.clothingItem.count(),
  ]);

  console.log("Done. Current counts:", { bookings: b, bookingItems: bi, clothingItems: ci });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
