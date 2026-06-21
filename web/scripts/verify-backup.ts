import prisma from "../src/lib/prisma";
import { buildFullBackup } from "../src/lib/backupData";

async function main() {
  const [
    bookingCount,
    bookingItemCount,
    inventoryCount,
    customerCount,
    staffCount,
    userCount,
    categoryCount,
    attendanceCount,
    supplierCount,
    purchaseCount,
    rentalCount,
    rentalItemCount,
    invoiceCount,
    paymentCount,
    leadCount,
    leadItemCount,
    enquiryCount,
    activityCount,
  ] = await Promise.all([
    prisma.booking.count(),
    prisma.bookingItem.count(),
    prisma.clothingItem.count(),
    prisma.customer.count(),
    prisma.staff.count(),
    prisma.user.count(),
    prisma.customCategory.count(),
    prisma.staffAttendance.count(),
    prisma.supplier.count(),
    prisma.supplierPurchase.count(),
    prisma.rental.count(),
    prisma.rentalItem.count(),
    prisma.invoice.count(),
    prisma.payment.count(),
    prisma.prospectLead.count(),
    prisma.prospectLeadItem.count(),
    prisma.shopEnquiry.count(),
    prisma.activityLog.count(),
  ]);

  const backup = await buildFullBackup("verify-script");
  const c = backup.meta.record_counts;

  const checks: Array<[string, number, number]> = [
    ["bookings", bookingCount, c.bookings],
    ["booking_items", bookingItemCount, c.booking_items],
    ["inventory", inventoryCount, c.inventory],
    ["customers", customerCount, c.customers],
    ["staff", staffCount, c.staff],
    ["users", userCount, c.users],
    ["custom_categories", categoryCount, c.custom_categories],
    ["attendance", attendanceCount, c.attendance],
    ["suppliers", supplierCount, c.suppliers],
    ["supplier_purchases", purchaseCount, c.supplier_purchases],
    ["rentals", rentalCount, c.rentals],
    ["rental_items", rentalItemCount, c.rental_items],
    ["invoices", invoiceCount, c.invoices],
    ["payments", paymentCount, c.payments],
    ["prospect_leads", leadCount, c.prospect_leads],
    ["prospect_lead_items", leadItemCount, c.prospect_lead_items],
    ["shop_enquiries", enquiryCount, c.shop_enquiries],
    ["activity_logs", activityCount, c.activity_logs],
  ];

  let ok = true;
  for (const [name, db, backed] of checks) {
    const pass = db === backed;
    if (!pass) ok = false;
    console.log(`${pass ? "OK" : "FAIL"} ${name}: db=${db} backup=${backed}`);
  }

  console.log(`\nPhoto manifest: ${backup.meta.photo_manifest.length} paths`);
  console.log(`Backup version: ${backup.meta.version}`);
  console.log(ok ? "\nAll backup counts match database." : "\nSome counts mismatched.");

  if (!ok) process.exitCode = 1;
}

main().finally(() => prisma.$disconnect());
