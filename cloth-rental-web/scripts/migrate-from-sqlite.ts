/**
 * Import existing SQLite data into PostgreSQL (run once before Vercel deploy).
 *
 * Usage:
 *   SQLITE_PATH="../fancynew/cloth_rental.db" npm run db:import-sqlite
 */
import Database from "better-sqlite3";
import path from "path";
import { prisma } from "../src/lib/db";

const sqlitePath =
  process.env.SQLITE_PATH ||
  path.join(__dirname, "../../fancynew/cloth_rental.db");

function toDate(v: string | null): Date | null {
  if (!v) return null;
  return new Date(v);
}

async function main() {
  console.log("Reading SQLite:", sqlitePath);
  const db = new Database(sqlitePath, { readonly: true });

  const tables = [
    "users",
    "staff",
    "customers",
    "clothing_items",
    "custom_categories",
    "bookings",
    "booking_items",
    "rentals",
    "rental_items",
    "invoices",
    "payments",
    "staff_attendance",
    "suppliers",
    "supplier_purchases",
    "staff_login_requests",
    "user_sessions",
  ] as const;

  console.log("Clearing Postgres tables (reverse FK order)...");
  await prisma.userSession.deleteMany();
  await prisma.staffLoginRequest.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.rentalItem.deleteMany();
  await prisma.rental.deleteMany();
  await prisma.bookingItem.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.staffAttendance.deleteMany();
  await prisma.supplierPurchase.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.customCategory.deleteMany();
  await prisma.clothingItem.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.user.deleteMany();
  await prisma.staff.deleteMany();

  const staff = db.prepare("SELECT * FROM staff").all() as Record<string, unknown>[];
  for (const s of staff) {
    await prisma.staff.create({
      data: {
        id: s.id as number,
        name: s.name as string,
        phone: (s.phone as string) || null,
        active: Boolean(s.active ?? true),
        createdAt: toDate(s.created_at as string) || new Date(),
      },
    });
  }

  const users = db.prepare("SELECT * FROM users").all() as Record<string, unknown>[];
  for (const u of users) {
    await prisma.user.create({
      data: {
        id: u.id as number,
        username: u.username as string,
        passwordHash: u.password_hash as string,
        role: u.role as string,
        staffId: (u.staff_id as number) || null,
        active: Boolean(u.active ?? true),
        createdAt: toDate(u.created_at as string) || new Date(),
      },
    });
  }

  const customers = db.prepare("SELECT * FROM customers").all() as Record<string, unknown>[];
  for (const c of customers) {
    await prisma.customer.create({
      data: {
        id: c.id as number,
        name: c.name as string,
        phone: c.phone as string,
        email: (c.email as string) || null,
        address: (c.address as string) || null,
        idProof: (c.id_proof as string) || null,
        notes: (c.notes as string) || null,
        createdAt: toDate(c.created_at as string) || new Date(),
      },
    });
  }

  const items = db.prepare("SELECT * FROM clothing_items").all() as Record<string, unknown>[];
  for (const i of items) {
    await prisma.clothingItem.create({
      data: {
        id: i.id as number,
        name: i.name as string,
        sku: i.sku as string,
        category: i.category as string,
        size: (i.size as string) || null,
        color: (i.color as string) || null,
        dailyRate: Number(i.daily_rate) || 0,
        deposit: Number(i.deposit) || 0,
        status: (i.status as string) || "available",
        itemType: (i.item_type as string) || "clothing",
        photo: (i.photo as string) || null,
        conditionNotes: (i.condition_notes as string) || null,
        subCategory: (i.sub_category as string) || null,
        createdAt: toDate(i.created_at as string) || new Date(),
      },
    });
  }

  const cats = db.prepare("SELECT * FROM custom_categories").all() as Record<string, unknown>[];
  for (const c of cats) {
    await prisma.customCategory.create({
      data: {
        id: c.id as number,
        name: c.name as string,
        group: (c.group as string) || "other",
        active: Boolean(c.active ?? true),
        createdAt: toDate(c.created_at as string) || new Date(),
      },
    });
  }

  const bookings = db.prepare("SELECT * FROM bookings").all() as Record<string, unknown>[];
  for (const b of bookings) {
    await prisma.booking.create({
      data: {
        id: b.id as number,
        bookingNumber: b.booking_number as string,
        monthlySerial: Number(b.monthly_serial) || 0,
        customerName: b.customer_name as string,
        customerAddress: b.customer_address as string,
        contact1: b.contact_1 as string,
        whatsappNo: (b.whatsapp_no as string) || null,
        deliveryDate: toDate(b.delivery_date as string)!,
        deliveryTime: b.delivery_time as string,
        returnDate: toDate(b.return_date as string)!,
        returnTime: b.return_time as string,
        venue: (b.venue as string) || null,
        securityDeposit: Number(b.security_deposit) || 0,
        totalPrice: Number(b.total_price) || 0,
        totalAdvance: Number(b.total_advance) || 0,
        totalRemaining: Number(b.total_remaining) || 0,
        commonNotes: (b.common_notes as string) || null,
        staffNames: (b.staff_names as string) || null,
        status: (b.status as string) || "booked",
        deliveryNotes: (b.delivery_notes as string) || null,
        remainingCollected: Number(b.remaining_collected) || 0,
        securityCollected: Number(b.security_collected) || 0,
        deliveredAt: toDate(b.delivered_at as string),
        returnedAt: toDate(b.returned_at as string),
        incompleteNotes: (b.incomplete_notes as string) || null,
        securityHeld: Number(b.security_held) || 0,
        itemId: (b.item_id as number) || null,
        dressName: (b.dress_name as string) || null,
        price: Number(b.price) || 0,
        advance: Number(b.advance) || 0,
        remaining: Number(b.remaining) || 0,
        notes: (b.notes as string) || null,
        contact2: (b.contact_2 as string) || null,
        createdAt: toDate(b.created_at as string) || new Date(),
      },
    });
  }

  const bis = db.prepare("SELECT * FROM booking_items").all() as Record<string, unknown>[];
  for (const bi of bis) {
    await prisma.bookingItem.create({
      data: {
        id: bi.id as number,
        bookingId: bi.booking_id as number,
        itemId: bi.item_id as number,
        dressName: bi.dress_name as string,
        category: (bi.category as string) || null,
        price: Number(bi.price) || 0,
        advance: Number(bi.advance) || 0,
        remaining: Number(bi.remaining) || 0,
        size: (bi.size as string) || null,
        notes: (bi.notes as string) || null,
        preparedBy: (bi.prepared_by as string) || null,
        checkedBy: (bi.checked_by as string) || null,
        isPackedReady: Boolean(bi.is_packed_ready),
        packingNote: (bi.packing_note as string) || null,
      },
    });
  }

  console.log("Import complete.");
  console.log(`  Users: ${users.length}, Items: ${items.length}, Bookings: ${bookings.length}`);
  db.close();
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
