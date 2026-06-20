import prisma, { dateQ, parseDateQ } from "../prisma";
import { hashPassword } from "../auth";
import { parseDate } from "../constants";

export async function getStaffWork(fromStr: string, toStr: string) {
  const fromDate = parseDate(fromStr);
  const toDate = parseDate(toStr);
  const toEnd = new Date(toDate);
  toEnd.setUTCDate(toEnd.getUTCDate() + 1);

  const bookings = await prisma.booking.findMany({
    where: {
      createdAt: { gte: dateQ(fromDate), lt: dateQ(toEnd) },
      status: { not: "cancelled" },
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

export async function saveAttendance(dateStr: string, statuses: Record<number, string>) {
  const date = parseDateQ(dateStr);
  for (const [staffIdStr, status] of Object.entries(statuses)) {
    const staffId = parseInt(staffIdStr, 10);
    if (!status) continue;
    await prisma.staffAttendance.upsert({
      where: { staffId_date: { staffId, date } },
      create: { staffId, date, status },
      update: { status },
    });
  }
}

export async function markShopClosed(dateStr: string) {
  const date = parseDateQ(dateStr);
  const staffList = await prisma.staff.findMany({ where: { active: true } });
  for (const s of staffList) {
    await prisma.staffAttendance.upsert({
      where: { staffId_date: { staffId: s.id, date } },
      create: { staffId: s.id, date, status: "shop_closed" },
      update: { status: "shop_closed" },
    });
  }
}
