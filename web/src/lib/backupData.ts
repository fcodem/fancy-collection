import prisma from "./prisma";
import { BRAND_FULL_NAME } from "./branding";

export const BACKUP_VERSION = "2.1";

export type BackupMeta = {
  app: string;
  exported_at: string;
  exported_by: string;
  version: string;
  record_counts: Record<string, number>;
  photo_manifest: string[];
  notes: string[];
};

export type BackupPayload = {
  meta: BackupMeta;
  bookings: Awaited<ReturnType<typeof fetchBookings>>;
  inventory: Awaited<ReturnType<typeof fetchInventory>>;
  customers: Awaited<ReturnType<typeof fetchCustomers>>;
  staff: Awaited<ReturnType<typeof fetchStaff>>;
  users: Awaited<ReturnType<typeof fetchUsers>>;
  custom_categories: Awaited<ReturnType<typeof fetchCustomCategories>>;
  attendance: Awaited<ReturnType<typeof fetchAttendance>>;
  suppliers: Awaited<ReturnType<typeof fetchSuppliers>>;
  supplier_purchases: Awaited<ReturnType<typeof fetchSupplierPurchases>>;
  rentals: Awaited<ReturnType<typeof fetchRentals>>;
  invoices: Awaited<ReturnType<typeof fetchInvoices>>;
  prospect_leads: Awaited<ReturnType<typeof fetchProspectLeads>>;
  shop_enquiries: Awaited<ReturnType<typeof fetchShopEnquiries>>;
  activity_logs: Awaited<ReturnType<typeof fetchActivityLogs>>;
};

function dateStr(d: Date | null | undefined) {
  if (!d) return null;
  return d.toISOString();
}

function collectPhotoManifest(
  inventory: Array<{ photo: string | null }>,
  bookings: Array<{
    idPhoto1: string | null;
    idPhoto2: string | null;
    incompletePhoto: string | null;
    bookingItems: Array<{ itemIncompletePhoto: string | null }>;
  }>,
): string[] {
  const paths = new Set<string>();
  for (const i of inventory) {
    if (i.photo?.trim()) paths.add(i.photo.trim());
  }
  for (const b of bookings) {
    for (const p of [b.idPhoto1, b.idPhoto2, b.incompletePhoto]) {
      if (p?.trim()) paths.add(p.trim());
    }
    for (const bi of b.bookingItems) {
      if (bi.itemIncompletePhoto?.trim()) paths.add(bi.itemIncompletePhoto.trim());
    }
  }
  return [...paths].sort();
}

async function fetchBookings() {
  const rows = await prisma.booking.findMany({
    include: { bookingItems: true },
    orderBy: { id: "asc" },
  });
  return rows.map((b) => ({
    ...b,
    deliveryDate: dateStr(b.deliveryDate),
    returnDate: dateStr(b.returnDate),
    deliveredAt: dateStr(b.deliveredAt),
    returnedAt: dateStr(b.returnedAt),
    refundedAt: dateStr(b.refundedAt),
    createdAt: dateStr(b.createdAt),
    bookingItems: b.bookingItems.map((bi) => ({
      ...bi,
      deliveredAt: dateStr(bi.deliveredAt),
    })),
  }));
}

async function fetchInventory() {
  return prisma.clothingItem.findMany({ orderBy: { id: "asc" } }).then((rows) =>
    rows.map((i) => ({ ...i, createdAt: dateStr(i.createdAt) })),
  );
}

async function fetchCustomers() {
  return prisma.customer.findMany({ orderBy: { id: "asc" } }).then((rows) =>
    rows.map((c) => ({ ...c, createdAt: dateStr(c.createdAt) })),
  );
}

async function fetchStaff() {
  return prisma.staff.findMany({ orderBy: { id: "asc" } }).then((rows) =>
    rows.map((s) => ({ ...s, createdAt: dateStr(s.createdAt) })),
  );
}

async function fetchUsers() {
  return prisma.user.findMany({ orderBy: { id: "asc" } }).then((rows) =>
    rows.map((u) => ({ ...u, createdAt: dateStr(u.createdAt) })),
  );
}

async function fetchCustomCategories() {
  return prisma.customCategory.findMany({ orderBy: { id: "asc" } }).then((rows) =>
    rows.map((c) => ({ ...c, createdAt: dateStr(c.createdAt) })),
  );
}

async function fetchAttendance() {
  return prisma.staffAttendance.findMany({ orderBy: { id: "asc" } }).then((rows) =>
    rows.map((a) => ({ ...a, date: dateStr(a.date) })),
  );
}

async function fetchSuppliers() {
  return prisma.supplier.findMany({ orderBy: { id: "asc" } }).then((rows) =>
    rows.map((s) => ({ ...s, createdAt: dateStr(s.createdAt) })),
  );
}

async function fetchSupplierPurchases() {
  return prisma.supplierPurchase.findMany({ orderBy: { id: "asc" } }).then((rows) =>
    rows.map((p) => ({ ...p, date: dateStr(p.date) })),
  );
}

async function fetchRentals() {
  return prisma.rental.findMany({
    include: { items: true },
    orderBy: { id: "asc" },
  }).then((rows) =>
    rows.map((r) => ({
      ...r,
      startDate: dateStr(r.startDate),
      endDate: dateStr(r.endDate),
      actualReturnDate: dateStr(r.actualReturnDate),
      createdAt: dateStr(r.createdAt),
      items: r.items,
    })),
  );
}

async function fetchInvoices() {
  return prisma.invoice.findMany({
    include: { payments: true },
    orderBy: { id: "asc" },
  }).then((rows) =>
    rows.map((inv) => ({
      ...inv,
      issueDate: dateStr(inv.issueDate),
      dueDate: dateStr(inv.dueDate),
      createdAt: dateStr(inv.createdAt),
      payments: inv.payments.map((p) => ({ ...p, paidAt: dateStr(p.paidAt) })),
    })),
  );
}

async function fetchProspectLeads() {
  return prisma.prospectLead.findMany({
    include: { items: true },
    orderBy: { id: "asc" },
  }).then((rows) =>
    rows.map((pl) => ({
      ...pl,
      deliveryDate: dateStr(pl.deliveryDate),
      returnDate: dateStr(pl.returnDate),
      lastReminderAt: dateStr(pl.lastReminderAt),
      createdAt: dateStr(pl.createdAt),
    })),
  );
}

async function fetchShopEnquiries() {
  return prisma.shopEnquiry.findMany({ orderBy: { id: "asc" } }).then((rows) =>
    rows.map((e) => ({
      ...e,
      visitDate: dateStr(e.visitDate),
      dressNeededDate: dateStr(e.dressNeededDate),
      createdAt: dateStr(e.createdAt),
    })),
  );
}

async function fetchActivityLogs() {
  return prisma.activityLog.findMany({ orderBy: { id: "asc" } }).then((rows) =>
    rows.map((l) => ({ ...l, createdAt: dateStr(l.createdAt) })),
  );
}

export async function buildFullBackup(exportedBy: string): Promise<BackupPayload> {
  const [
    bookings,
    inventory,
    customers,
    staff,
    users,
    customCategories,
    attendance,
    suppliers,
    supplierPurchases,
    rentals,
    invoices,
    prospectLeads,
    shopEnquiries,
    activityLogs,
  ] = await Promise.all([
    fetchBookings(),
    fetchInventory(),
    fetchCustomers(),
    fetchStaff(),
    fetchUsers(),
    fetchCustomCategories(),
    fetchAttendance(),
    fetchSuppliers(),
    fetchSupplierPurchases(),
    fetchRentals(),
    fetchInvoices(),
    fetchProspectLeads(),
    fetchShopEnquiries(),
    fetchActivityLogs(),
  ]);

  const paymentCount = invoices.reduce((s, inv) => s + inv.payments.length, 0);
  const rentalItemCount = rentals.reduce((s, r) => s + r.items.length, 0);
  const bookingItemCount = bookings.reduce((s, b) => s + b.bookingItems.length, 0);
  const prospectItemCount = prospectLeads.reduce((s, pl) => s + pl.items.length, 0);
  const photoManifest = collectPhotoManifest(inventory, bookings);

  const now = new Date();
  return {
    meta: {
      app: `${BRAND_FULL_NAME} Management System`,
      exported_at: now.toISOString(),
      exported_by: exportedBy,
      version: BACKUP_VERSION,
      record_counts: {
        bookings: bookings.length,
        booking_items: bookingItemCount,
        inventory: inventory.length,
        customers: customers.length,
        staff: staff.length,
        users: users.length,
        custom_categories: customCategories.length,
        attendance: attendance.length,
        suppliers: suppliers.length,
        supplier_purchases: supplierPurchases.length,
        rentals: rentals.length,
        rental_items: rentalItemCount,
        invoices: invoices.length,
        payments: paymentCount,
        prospect_leads: prospectLeads.length,
        prospect_lead_items: prospectItemCount,
        shop_enquiries: shopEnquiries.length,
        activity_logs: activityLogs.length,
        photo_files: photoManifest.length,
      },
      photo_manifest: photoManifest,
      notes: [
        "JSON backup contains all database records.",
        "Photo/image files are referenced by path only — copy public/uploads/ (or use Vercel Blob URLs) separately to preserve images.",
      ],
    },
    bookings,
    inventory,
    customers,
    staff,
    users,
    custom_categories: customCategories,
    attendance,
    suppliers,
    supplier_purchases: supplierPurchases,
    rentals,
    invoices,
    prospect_leads: prospectLeads,
    shop_enquiries: shopEnquiries,
    activity_logs: activityLogs,
  };
}
