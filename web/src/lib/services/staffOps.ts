import prisma, { dateQ, parseDateQ } from "../prisma";
import { activeBookingWhere } from "@/lib/bookingActiveStatus";
import { hashPassword } from "../auth";
import { parseDate } from "../constants";
import { logActivity } from "../activityLog";

export async function getStaffWork(fromStr: string, toStr: string) {
  const fromDate = parseDate(fromStr);
  const toDate = parseDate(toStr);
  const toEnd = new Date(toDate);
  toEnd.setUTCDate(toEnd.getUTCDate() + 1);

  const bookings = await prisma.booking.findMany({
    where: {
      createdAt: { gte: dateQ(fromDate), lt: dateQ(toEnd) },
      ...activeBookingWhere(),
    },
    include: { bookingItems: true },
  });

  const staffStats: Record<string, { name: string; bookings: number; dresses: number; amount: number }> = {};
  for (const b of bookings) {
    if (!b.staffNames) continue;
    const names = b.staffNames.split(",").map((n) => n.trim()).filter(Boolean);
    const total = b.totalPrice || b.price;
    const splitAmount = names.length ? total / names.length : 0;
    const itemCount = b.bookingItems.length || 1;
    for (const name of names) {
      if (!staffStats[name]) staffStats[name] = { name, bookings: 0, dresses: 0, amount: 0 };
      staffStats[name].bookings += 1;
      staffStats[name].dresses += itemCount;
      staffStats[name].amount += splitAmount;
    }
  }
  return Object.values(staffStats);
}

export async function getStaffAttendance(monthStr: string) {
  const [year, month] = monthStr.split("-").map(Number);
  const monthStart = dateQ(new Date(Date.UTC(year, month - 1, 1)));
  const monthEnd = dateQ(new Date(Date.UTC(year, month, 1)));

  const staffList = await prisma.staff.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  const attendances = await prisma.staffAttendance.findMany({
    where: { date: { gte: monthStart, lt: monthEnd } },
  });

  return staffList.map((s) => {
    const records = attendances.filter((a) => a.staffId === s.id);
    return {
      id: s.id,
      name: s.name,
      present: records.filter((r) => r.status === "present").length,
      absent: records.filter((r) => r.status === "absent").length,
      half_day: records.filter((r) => r.status === "half_day").length,
    };
  });
}

export async function getAttendanceCalendar(staffId: number, monthStr: string) {
  const [year, month] = monthStr.split("-").map(Number);
  const monthStart = dateQ(new Date(Date.UTC(year, month - 1, 1)));
  const monthEnd = dateQ(new Date(Date.UTC(year, month, 1)));
  const records = await prisma.staffAttendance.findMany({
    where: { staffId, date: { gte: monthStart, lt: monthEnd } },
  });
  const days: Record<string, string> = {};
  for (const r of records) {
    days[r.date.toISOString().slice(0, 10)] = r.status;
  }
  return { days };
}

export async function addStaff(data: {
  name: string;
  phone?: string;
  username?: string;
  password?: string;
  role?: string;
}) {
  const existing = data.username
    ? await prisma.user.findUnique({ where: { username: data.username } })
    : null;
  if (existing) throw new Error(`Username '${data.username}' is already taken.`);

  return prisma.$transaction(async (tx) => {
    const s = await tx.staff.create({
      data: { name: data.name.trim(), phone: data.phone?.trim() || null },
    });
    if (data.username && data.password) {
      await tx.user.create({
        data: {
          username: data.username.trim(),
          passwordHash: await hashPassword(data.password),
          role: data.role || "staff",
          staffId: s.id,
        },
      });
    }
    return s;
  });
}

export async function removeStaff(staffId: number) {
  return prisma.$transaction(async (tx) => {
    await tx.staff.update({ where: { id: staffId }, data: { active: false } });
    await tx.user.updateMany({ where: { staffId }, data: { active: false } });
  });
}

export async function saveAttendance(dateStr: string, statuses: Record<number, string>, by?: string) {
  const date = parseDateQ(dateStr);
  const staffList = await prisma.staff.findMany({ where: { active: true }, select: { id: true, name: true } });
  const nameById = new Map(staffList.map((s) => [s.id, s.name]));
  const saved: Record<string, string> = {};

  for (const [staffIdStr, status] of Object.entries(statuses)) {
    const staffId = parseInt(staffIdStr, 10);
    if (!status) continue;
    await prisma.staffAttendance.upsert({
      where: { staffId_date: { staffId, date } },
      create: { staffId, date, status },
      update: { status },
    });
    const staffName = nameById.get(staffId);
    if (staffName) saved[staffName] = status;
  }

  if (Object.keys(saved).length) {
    logActivity({
      username: by || "system",
      action: "attendance",
      entity: "staff_attendance",
      label: `Attendance saved for ${dateStr.slice(0, 10)}`,
      after: { date: dateStr.slice(0, 10), statuses: saved },
    });
  }
}

/** Salary ledger — money/advances paid to a staff member. Multiple entries per day allowed. */
export async function getSalaryLedgerCalendar(staffId: number, monthStr: string) {
  const [year, month] = monthStr.split("-").map(Number);
  const monthStart = dateQ(new Date(Date.UTC(year, month - 1, 1)));
  const monthEnd = dateQ(new Date(Date.UTC(year, month, 1)));
  const records = await prisma.salaryLedgerEntry.findMany({
    where: { staffId, date: { gte: monthStart, lt: monthEnd } },
    orderBy: [{ date: "asc" }, { id: "asc" }],
  });

  const days: Record<string, number> = {};
  let total = 0;
  const entries = records.map((r) => {
    const day = r.date.toISOString().slice(0, 10);
    days[day] = (days[day] || 0) + r.amount;
    total += r.amount;
    return { id: r.id, date: day, amount: r.amount, note: r.note || "" };
  });

  return { days, entries, total };
}

export async function getSalaryLedgerSummary(monthStr: string) {
  const [year, month] = monthStr.split("-").map(Number);
  const monthStart = dateQ(new Date(Date.UTC(year, month - 1, 1)));
  const monthEnd = dateQ(new Date(Date.UTC(year, month, 1)));

  const staffList = await prisma.staff.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  const records = await prisma.salaryLedgerEntry.findMany({
    where: { date: { gte: monthStart, lt: monthEnd } },
  });

  return staffList.map((s) => {
    const own = records.filter((r) => r.staffId === s.id);
    return {
      id: s.id,
      name: s.name,
      total: own.reduce((sum, r) => sum + r.amount, 0),
      count: own.length,
    };
  });
}

export async function addSalaryEntry(
  data: { staffId: number; date: string; amount: number; note?: string },
  by?: string,
) {
  const date = parseDateQ(data.date);
  const amount = Number(data.amount);
  if (!data.staffId) throw new Error("Staff is required.");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a valid amount.");

  const staff = await prisma.staff.findUnique({ where: { id: data.staffId }, select: { name: true } });
  if (!staff) throw new Error("Staff not found.");

  const entry = await prisma.salaryLedgerEntry.create({
    data: { staffId: data.staffId, date, amount, note: data.note?.trim() || null },
  });

  logActivity({
    username: by || "system",
    action: "salary",
    entity: "salary_ledger",
    label: `Paid ₹${amount} to ${staff.name} on ${data.date.slice(0, 10)}`,
    after: { staff: staff.name, date: data.date.slice(0, 10), amount, note: data.note || "" },
  });

  return entry;
}

export async function deleteSalaryEntry(id: number, by?: string) {
  const entry = await prisma.salaryLedgerEntry.findUnique({
    where: { id },
    include: { staff: { select: { name: true } } },
  });
  if (!entry) throw new Error("Entry not found.");

  await prisma.salaryLedgerEntry.delete({ where: { id } });

  logActivity({
    username: by || "system",
    action: "salary",
    entity: "salary_ledger",
    label: `Removed ₹${entry.amount} salary entry for ${entry.staff.name}`,
    before: { staff: entry.staff.name, date: entry.date.toISOString().slice(0, 10), amount: entry.amount },
  });
}

export async function markShopClosed(dateStr: string, by?: string) {
  const date = parseDateQ(dateStr);
  const staffList = await prisma.staff.findMany({ where: { active: true } });
  for (const s of staffList) {
    await prisma.staffAttendance.upsert({
      where: { staffId_date: { staffId: s.id, date } },
      create: { staffId: s.id, date, status: "shop_closed" },
      update: { status: "shop_closed" },
    });
  }
  logActivity({
    username: by || "system",
    action: "attendance",
    entity: "staff_attendance",
    label: `Shop closed — ${dateStr.slice(0, 10)} (all staff)`,
    after: { date: dateStr.slice(0, 10), status: "shop_closed", staff_count: staffList.length },
  });
}
