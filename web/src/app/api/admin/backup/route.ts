import prisma from "@/lib/prisma";
import { requireOwner, isResponse } from "@/lib/api";

export const dynamic = "force-dynamic";

function dateStr(d: Date | null | undefined) {
  if (!d) return null;
  return d.toISOString();
}

export async function GET() {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  const [
    bookings,
    inventory,
    customers,
    staff,
    users,
    customCategories,
  ] = await Promise.all([
    prisma.booking.findMany({ include: { bookingItems: true }, orderBy: { id: "asc" } }),
    prisma.clothingItem.findMany({ orderBy: { id: "asc" } }),
    prisma.customer.findMany({ orderBy: { id: "asc" } }),
    prisma.staff.findMany({ orderBy: { id: "asc" } }),
    prisma.user.findMany({ orderBy: { id: "asc" } }),
    prisma.customCategory.findMany({ orderBy: { id: "asc" } }),
  ]);

  const [attendance, suppliers, supplierPurchases, prospectLeads, shopEnquiries] = await Promise.all([
    prisma.staffAttendance.findMany({ orderBy: { id: "asc" } }).catch(() => []),
    prisma.supplier.findMany({ orderBy: { id: "asc" } }).catch(() => []),
    prisma.supplierPurchase.findMany({ orderBy: { id: "asc" } }).catch(() => []),
    prisma.prospectLead.findMany({ include: { items: true }, orderBy: { id: "asc" } }).catch(() => []),
    prisma.shopEnquiry.findMany({ orderBy: { id: "asc" } }).catch(() => []),
  ]);

  const now = new Date();
  const backup = {
    meta: {
      app: "Fancy Collection Management System",
      exported_at: now.toISOString(),
      exported_by: user.username,
      version: "2.0",
      record_counts: {
        bookings: bookings.length,
        booking_items: bookings.reduce((s, b) => s + b.bookingItems.length, 0),
        inventory: inventory.length,
        customers: customers.length,
        staff: staff.length,
        users: users.length,
        custom_categories: customCategories.length,
        attendance: attendance.length,
        suppliers: suppliers.length,
        supplier_purchases: supplierPurchases.length,
        prospect_leads: (prospectLeads as unknown[]).length,
        shop_enquiries: shopEnquiries.length,
      },
    },
    bookings: bookings.map((b) => ({
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
    })),
    inventory: inventory.map((i) => ({ ...i, createdAt: dateStr(i.createdAt) })),
    customers: customers.map((c) => ({ ...c, createdAt: dateStr(c.createdAt) })),
    staff: staff.map((s) => ({ ...s, createdAt: dateStr(s.createdAt) })),
    users: users.map((u) => ({ ...u, createdAt: dateStr(u.createdAt) })),
    custom_categories: customCategories.map((c) => ({ ...c, createdAt: dateStr(c.createdAt) })),
    attendance: attendance,
    suppliers: (suppliers as Array<Record<string, unknown>>).map((s) => ({
      ...s,
      createdAt: dateStr(s.createdAt as Date | null),
    })),
    supplier_purchases: supplierPurchases,
    prospect_leads: prospectLeads,
    shop_enquiries: shopEnquiries,
  };

  const dateTag = now.toISOString().slice(0, 10);
  const json = JSON.stringify(backup, null, 2);

  return new Response(json, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="fancy-collection-backup-${dateTag}.json"`,
    },
  });
}
