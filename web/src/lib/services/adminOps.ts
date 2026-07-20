import prisma from "../prisma";
import { activeBookingWhere } from "@/lib/bookingActiveStatus";
import { dressDisplayName } from "../dress";
import {
  hashPassword,
  invalidateAllReadSessionCaches,
  invalidateReadSessionCachesForUser,
} from "../auth";
import { assertStrongPassword } from "../passwordPolicy";
import { invalidateCategoryCache } from "../categories";
import {
  BASE_ACCESSORY,
  BASE_JEWELLERY,
  BASE_MENS,
  BASE_WOMENS,
} from "../constants";

export type CategoryEntry = {
  name: string;
  group: string;
  id?: number;
  source: "base" | "custom";
  editable: boolean;
};
export async function* streamBookingsCsvChunks(batchSize = 250): AsyncGenerator<string> {
  const header = [
    "Serial#", "Booking#", "Status", "Customer", "Address", "Contact", "WhatsApp",
    "Venue", "Delivery Date", "Delivery Time", "Return Date", "Return Time",
    "Dresses", "Total Rent", "Advance Paid", "Remaining", "Security Deposit",
    "Common Notes", "Staff", "Created At",
  ].join(",");
  yield header + "\n";

  let cursorDate: Date | null = null;
  let cursorId = Number.MAX_SAFE_INTEGER;

  type BookingCsvRow = {
    id: number;
    monthlySerial: number;
    bookingNumber: string;
    status: string;
    customerName: string;
    customerAddress: string;
    contact1: string;
    whatsappNo: string | null;
    venue: string | null;
    deliveryDate: Date;
    deliveryTime: string;
    returnDate: Date;
    returnTime: string;
    totalPrice: number;
    totalAdvance: number;
    totalRemaining: number;
    securityDeposit: number;
    commonNotes: string | null;
    staffNames: string | null;
    createdAt: Date;
    dressName: string | null;
    bookingItems: Array<{ dressName: string }>;
  };

  for (;;) {
    const batch: BookingCsvRow[] = await prisma.booking.findMany({
      where: {
        ...activeBookingWhere(),
        ...(cursorDate
          ? {
              OR: [
                { deliveryDate: { lt: cursorDate } },
                { deliveryDate: cursorDate, id: { lt: cursorId } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        monthlySerial: true,
        bookingNumber: true,
        status: true,
        customerName: true,
        customerAddress: true,
        contact1: true,
        whatsappNo: true,
        venue: true,
        deliveryDate: true,
        deliveryTime: true,
        returnDate: true,
        returnTime: true,
        totalPrice: true,
        totalAdvance: true,
        totalRemaining: true,
        securityDeposit: true,
        commonNotes: true,
        staffNames: true,
        createdAt: true,
        dressName: true,
        bookingItems: { select: { dressName: true } },
      },
      orderBy: [{ deliveryDate: "desc" }, { id: "desc" }],
      take: batchSize,
    });

    if (!batch.length) break;

    for (const b of batch) {
      const dresses = b.bookingItems.length
        ? b.bookingItems.map((bi: { dressName: string }) => bi.dressName).join(" | ")
        : b.dressName || "";
      yield [
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
      ].join(",") + "\n";
    }

    if (batch.length < batchSize) break;
    const last = batch[batch.length - 1]!;
    cursorDate = last.deliveryDate;
    cursorId = last.id;
  }
}

export function streamBookingsCsvResponse(): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamBookingsCsvChunks()) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      } catch (e) {
        controller.error(e);
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="bookings_export.csv"',
      "Cache-Control": "no-store",
    },
  });
}

export async function exportBookingsCsv() {
  let out = "";
  for await (const chunk of streamBookingsCsvChunks()) out += chunk;
  return out;
}

export async function* streamInventoryCsvChunks(batchSize = 500): AsyncGenerator<string> {
  yield "SKU,Name,Category,Size,Color,Status,Daily Rate,Deposit,Sub-Category,Notes\n";

  let cursorCategory = "";
  let cursorName = "";
  let cursorId = 0;
  let first = true;

  for (;;) {
    const batch = await prisma.clothingItem.findMany({
      where: first
        ? undefined
        : {
            OR: [
              { category: { gt: cursorCategory } },
              { category: cursorCategory, name: { gt: cursorName } },
              { category: cursorCategory, name: cursorName, id: { gt: cursorId } },
            ],
          },
      select: {
        id: true,
        sku: true,
        name: true,
        category: true,
        size: true,
        color: true,
        status: true,
        dailyRate: true,
        deposit: true,
        subCategory: true,
        conditionNotes: true,
      },
      orderBy: [{ category: "asc" }, { name: "asc" }, { id: "asc" }],
      take: batchSize,
    });

    if (!batch.length) break;

    for (const i of batch) {
      yield [
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
      ].join(",") + "\n";
    }

    if (batch.length < batchSize) break;
    const last = batch[batch.length - 1]!;
    cursorCategory = last.category;
    cursorName = last.name;
    cursorId = last.id;
    first = false;
  }
}

export function streamInventoryCsvResponse(): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamInventoryCsvChunks()) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      } catch (e) {
        controller.error(e);
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="inventory_export.csv"',
      "Cache-Control": "no-store",
    },
  });
}

export async function exportInventoryCsv() {
  let out = "";
  for await (const chunk of streamInventoryCsvChunks()) out += chunk;
  return out;
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
  // Existing encrypted cookies carry the old role/revision. Incrementing the
  // authoritative revision makes them fail closed and require a fresh login.
  const [updated] = await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { role } }),
    prisma.userSession.updateMany({
      where: { userId, active: true },
      data: { revision: { increment: 1 } },
    }),
  ]);
  await invalidateReadSessionCachesForUser(userId);
  return updated;
}

export async function resetUserPassword(userId: number, password: string, endedById?: number) {
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) throw new Error("User not found");
  assertStrongPassword(password, { role: target.role, username: target.username });
  const passwordHash = await hashPassword(password);
  const [updated] = await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
    prisma.userSession.updateMany({
      where: { userId, active: true },
      data: {
        active: false,
        endedAt: new Date(),
        endedById: endedById ?? null,
        revision: { increment: 1 },
      },
    }),
  ]);
  await invalidateReadSessionCachesForUser(userId);
  return updated;
}

export async function toggleUserActive(userId: number, currentUserId: number) {
  if (userId === currentUserId) throw new Error("Cannot deactivate yourself.");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found");
  if (user.active) {
    const [updated] = await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { active: false } }),
      prisma.userSession.updateMany({
        where: { userId, active: true },
        data: {
          active: false,
          endedAt: new Date(),
          endedById: currentUserId,
          revision: { increment: 1 },
        },
      }),
    ]);
    await invalidateReadSessionCachesForUser(userId);
    return updated;
  }
  return prisma.user.update({ where: { id: userId }, data: { active: true } });
}

export async function changeOwnPassword(userId: number, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found");
  const { verifyPassword } = await import("../auth");
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new Error("Current password is incorrect.");
  }
  assertStrongPassword(newPassword, { role: user.role, username: user.username });
  const passwordHash = await hashPassword(newPassword);
  const [updated] = await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
    prisma.userSession.updateMany({
      where: { userId, active: true },
      data: {
        active: false,
        endedAt: new Date(),
        endedById: userId,
        revision: { increment: 1 },
      },
    }),
  ]);
  await invalidateReadSessionCachesForUser(userId);
  return updated;
}

export async function listCustomCategories() {
  return prisma.customCategory.findMany({ where: { active: true }, orderBy: { name: "asc" } });
}

export async function addCustomCategory(name: string, group: string) {
  const existing = await prisma.customCategory.findUnique({ where: { name: name.trim() } });
  if (existing) {
    if (!existing.active) {
      const updated = await prisma.customCategory.update({
        where: { id: existing.id },
        data: { active: true, group },
      });
      invalidateCategoryCache();
      return updated;
    }
    throw new Error("Category already exists.");
  }
  const created = await prisma.customCategory.create({ data: { name: name.trim(), group } });
  invalidateCategoryCache();
  return created;
}

export async function removeCustomCategory(id: number) {
  const updated = await prisma.customCategory.update({ where: { id }, data: { active: false } });
  invalidateCategoryCache();
  return updated;
}

export async function updateCustomCategory(id: number, name: string, group: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Category name is required.");
  const conflict = await prisma.customCategory.findFirst({
    where: { name: trimmed, active: true, NOT: { id } },
  });
  if (conflict) throw new Error("Category already exists.");
  const updated = await prisma.customCategory.update({
    where: { id },
    data: { name: trimmed, group: group || "other" },
  });
  invalidateCategoryCache();
  return updated;
}

export async function hideCategory(name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Category name is required.");
  const { hideCategoryName } = await import("../categoryTables");
  await hideCategoryName(trimmed);
  invalidateCategoryCache();
  return { name: trimmed };
}

export async function getManagedCategoryGroups(): Promise<Record<string, CategoryEntry[]>> {
  const { findHiddenCategoryNames } = await import("../categoryTables");
  const [custom, hiddenNames] = await Promise.all([
    listCustomCategories(),
    findHiddenCategoryNames(),
  ]);
  const hiddenSet = new Set(hiddenNames);
  const groups: Record<string, CategoryEntry[]> = {
    mens: [],
    womens: [],
    jewellery: [],
    accessory: [],
    other: [],
  };
  const baseMap: Record<string, string[]> = {
    mens: BASE_MENS,
    womens: BASE_WOMENS,
    jewellery: BASE_JEWELLERY,
    accessory: BASE_ACCESSORY,
  };
  for (const [group, names] of Object.entries(baseMap)) {
    for (const n of names) {
      if (!hiddenSet.has(n)) {
        groups[group].push({ name: n, group, source: "base", editable: false });
      }
    }
  }
  for (const c of custom) {
    const g = c.group in groups ? c.group : "other";
    if (!groups[g].some((x) => x.name === c.name)) {
      groups[g].push({ name: c.name, group: g, id: c.id, source: "custom", editable: true });
    }
  }
  for (const g of Object.keys(groups)) {
    groups[g].sort((a, b) => a.name.localeCompare(b.name));
  }
  return groups;
}

export async function listSubCategories() {
  const { findActiveSubCategories } = await import("../categoryTables");
  return findActiveSubCategories();
}

export async function addSubCategory(name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Sub-category name is required.");
  const { addSubCategoryRow } = await import("../categoryTables");
  return addSubCategoryRow(trimmed);
}

export async function updateSubCategory(id: number, name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Sub-category name is required.");
  const { updateSubCategoryRow } = await import("../categoryTables");
  return updateSubCategoryRow(id, trimmed);
}

export async function removeSubCategory(id: number) {
  const { removeSubCategoryRow } = await import("../categoryTables");
  await removeSubCategoryRow(id);
}
export async function listSuppliers() {
  return prisma.supplier.findMany({
    include: { purchases: { orderBy: { date: "desc" } } },
    orderBy: { name: "asc" },
  });
}

export async function addSupplier(data: {
  name: string;
  phone?: string;
  address?: string;
  gst_no?: string;
  account_details?: string;
}) {
  return prisma.supplier.create({
    data: {
      name: data.name.trim(),
      phone: data.phone?.trim() || null,
      address: data.address?.trim() || null,
      gstNo: data.gst_no?.trim() || null,
      accountDetails: data.account_details?.trim() || null,
    },
  });
}

export async function getSupplierPurchaseSummary(supplierId: number, fromStr: string, toStr: string) {
  const from = new Date(fromStr + "T00:00:00.000Z");
  const to = new Date(toStr + "T23:59:59.999Z");
  const purchases = await prisma.supplierPurchase.findMany({
    where: { supplierId, date: { gte: from, lte: to }, transactionType: "purchase" },
  });
  const byCategory: Record<string, number> = {};
  let total = 0;
  let totalGst = 0;
  for (const p of purchases) {
    const cat = (p.category || "Uncategorized").trim() || "Uncategorized";
    byCategory[cat] = (byCategory[cat] || 0) + p.amount;
    total += p.amount;
    totalGst += p.gstAmount;
  }
  return { by_category: byCategory, total, total_gst: totalGst, count: purchases.length };
}

export async function addSupplierPurchase(
  supplierId: number,
  data: {
    item_description: string;
    category?: string;
    amount: number;
    gst_amount?: number;
    gst_percent?: number;
    date?: string;
    notes?: string;
  }
) {
  const gstPercent = data.gst_percent || 0;
  const gstAmount = data.gst_amount ?? Math.round((data.amount * gstPercent) / 100);
  return prisma.supplierPurchase.create({
    data: {
      supplierId,
      itemDescription: data.item_description.trim(),
      category: data.category?.trim() || null,
      amount: data.amount,
      gstAmount,
      gstPercent,
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
    prisma.hiddenCategory.deleteMany(),
    prisma.customSubCategory.deleteMany(),
    prisma.clothingItem.deleteMany(),
    prisma.customer.deleteMany(),
  ]);
  await invalidateAllReadSessionCaches();
}
