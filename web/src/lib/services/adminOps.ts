import prisma from "../prisma";
import { dressDisplayName } from "../dress";
import { hashPassword } from "../auth";

export async function exportBookingsCsv() {
  const bookings = await prisma.booking.findMany({
    where: { status: { not: "cancelled" } },
    include: { bookingItems: true },
    orderBy: { deliveryDate: "desc" },
  });

  const header = [
    "Serial#", "Booking#", "Status", "Customer", "Address", "Contact", "WhatsApp",
    "Venue", "Delivery Date", "Delivery Time", "Return Date", "Return Time",
    "Dresses", "Total Rent", "Advance Paid", "Remaining", "Security Deposit",
    "Common Notes", "Staff", "Created At",
  ].join(",");

  const rows = bookings.map((b) => {
    const dresses = b.bookingItems.length
      ? b.bookingItems.map((bi) => bi.dressName).join(" | ")
      : b.dressName || "";
    return [
      b.monthlySerial ? `#${String(b.monthlySerial).padStart(2, "0")}` : "",
      b.bookingNumber,
      b.status,
      `"${b.customerName.replace(/"/g, '""')}"`,
      `"${b.customerAddress.replace(/"/g, '""')}"`,
      b.contact1,
      b.whatsappNo || "",
      `"${(b.venue || "").replace(/"/g, '""')}"`,
      b.deliveryDate.toISOString().slice(0, 10),
      b.deliveryTime,
      b.returnDate.toISOString().slice(0, 10),
      b.returnTime,
      `"${dresses.replace(/"/g, '""')}"`,
      b.totalPrice,
      b.totalAdvance,
      b.totalRemaining,
      b.securityDeposit,
      `"${(b.commonNotes || "").replace(/"/g, '""')}"`,
      `"${(b.staffNames || "").replace(/"/g, '""')}"`,
      b.createdAt.toISOString(),
    ].join(",");
  });

  return [header, ...rows].join("\n");
}

export async function exportInventoryCsv() {
  const items = await prisma.clothingItem.findMany({ orderBy: [{ category: "asc" }, { name: "asc" }] });
  const header = "SKU,Name,Category,Size,Color,Status,Daily Rate,Deposit,Sub-Category,Notes\n";
  const rows = items.map((i) =>
    [
      i.sku,
      `"${dressDisplayName(i.name, i.category, i.size).replace(/"/g, '""')}"`,
      i.category,
      i.size || "",
      i.color || "",
      i.status,
      i.dailyRate,
      i.deposit,
      i.subCategory || "",
      `"${(i.conditionNotes || "").replace(/"/g, '""')}"`,
    ].join(",")
  );
  return header + rows.join("\n");
}

export async function listUsers() {
  return prisma.user.findMany({
    include: { staff: true },
    orderBy: { username: "asc" },
  });
}

export async function getStaffWithoutAccounts() {
  const staff = await prisma.staff.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  const withAccounts = new Set(
    (await prisma.user.findMany({ where: { staffId: { not: null } } })).map((u) => u.staffId)
  );
  return staff.filter((s) => !withAccounts.has(s.id));
}

export async function changeUserRole(userId: number, role: string, currentUserId: number) {
  if (userId === currentUserId) throw new Error("Cannot change your own role.");
  return prisma.user.update({ where: { id: userId }, data: { role } });
}

export async function resetUserPassword(userId: number, password: string) {
  if (password.length < 4) throw new Error("Password must be at least 4 characters.");
  return prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(password) },
  });
}

export async function toggleUserActive(userId: number, currentUserId: number) {
  if (userId === currentUserId) throw new Error("Cannot deactivate yourself.");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found");
  return prisma.user.update({ where: { id: userId }, data: { active: !user.active } });
}

export async function changeOwnPassword(userId: number, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found");
  const { verifyPassword } = await import("../auth");
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new Error("Current password is incorrect.");
  }
  if (newPassword.length < 4) throw new Error("New password must be at least 4 characters.");
  return prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(newPassword) },
  });
}

export async function listCustomCategories() {
  return prisma.customCategory.findMany({ where: { active: true }, orderBy: { name: "asc" } });
}

export async function addCustomCategory(name: string, group: string) {
  const existing = await prisma.customCategory.findUnique({ where: { name: name.trim() } });
  if (existing) {
    if (!existing.active) {
      return prisma.customCategory.update({ where: { id: existing.id }, data: { active: true, group } });
    }
    throw new Error("Category already exists.");
  }
  return prisma.customCategory.create({ data: { name: name.trim(), group } });
}

export async function removeCustomCategory(id: number) {
  return prisma.customCategory.update({ where: { id }, data: { active: false } });
}

export async function listSuppliers() {
  return prisma.supplier.findMany({
    include: { purchases: { orderBy: { date: "desc" } } },
    orderBy: { name: "asc" },
  });
}

export async function addSupplier(data: { name: string; phone?: string; address?: string }) {
  return prisma.supplier.create({
    data: {
      name: data.name.trim(),
      phone: data.phone?.trim() || null,
      address: data.address?.trim() || null,
    },
  });
}

export async function addSupplierPurchase(
  supplierId: number,
  data: {
    item_description: string;
    category?: string;
    amount: number;
    gst_amount?: number;
    date?: string;
    notes?: string;
  }
) {
  return prisma.supplierPurchase.create({
    data: {
      supplierId,
      itemDescription: data.item_description.trim(),
      category: data.category?.trim() || null,
      amount: data.amount,
      gstAmount: data.gst_amount || 0,
      transactionType: "purchase",
      date: data.date ? new Date(data.date + "T00:00:00.000Z") : new Date(),
      notes: data.notes?.trim() || null,
    },
  });
}

export async function addSupplierReturn(
  supplierId: number,
  data: {
    item_description: string;
    category?: string;
    amount: number;
    date?: string;
    notes?: string;
  }
) {
  return prisma.supplierPurchase.create({
    data: {
      supplierId,
      itemDescription: data.item_description.trim(),
      category: data.category?.trim() || null,
      amount: -Math.abs(data.amount),
      gstAmount: 0,
      transactionType: "return",
      date: data.date ? new Date(data.date + "T00:00:00.000Z") : new Date(),
      notes: data.notes?.trim() || null,
    },
  });
}

export async function resetAllData() {
  await prisma.$transaction([
    prisma.userSession.deleteMany(),
    prisma.staffLoginRequest.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.invoice.deleteMany(),
    prisma.rentalItem.deleteMany(),
    prisma.rental.deleteMany(),
    prisma.bookingItem.deleteMany(),
    prisma.booking.deleteMany(),
    prisma.staffAttendance.deleteMany(),
    prisma.supplierPurchase.deleteMany(),
    prisma.supplier.deleteMany(),
    prisma.customCategory.deleteMany(),
    prisma.clothingItem.deleteMany(),
    prisma.customer.deleteMany(),
  ]);
}
