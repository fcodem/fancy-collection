import prisma, { startOfMonthQ, endOfMonthQ } from "../src/lib/prisma";
import { formatDate } from "../src/lib/constants";

async function main() {
  const bookings = await prisma.booking.findMany({
    select: {
      id: true,
      monthlySerial: true,
      customerName: true,
      deliveryDate: true,
      status: true,
      createdAt: true,
    },
    orderBy: [{ deliveryDate: "asc" }, { monthlySerial: "asc" }, { id: "asc" }],
  });

  const monthMap = new Map<string, typeof bookings>();
  for (const b of bookings) {
    const key = formatDate(b.deliveryDate, "iso").slice(0, 7);
    if (!monthMap.has(key)) monthMap.set(key, []);
    monthMap.get(key)!.push(b);
  }

  for (const [month, rows] of [...monthMap.entries()].sort()) {
    const bySerial = new Map<number, number[]>();
    for (const b of rows) {
      if (!bySerial.has(b.monthlySerial)) bySerial.set(b.monthlySerial, []);
      bySerial.get(b.monthlySerial)!.push(b.id);
    }
    const dupes = [...bySerial.entries()].filter(([, ids]) => ids.length > 1);
    if (dupes.length) {
      console.log(`\n${month} duplicates:`);
      for (const [serial, ids] of dupes) {
        for (const id of ids) {
          const b = rows.find((r) => r.id === id)!;
          console.log(`  serial ${serial} id=${id} ${b.customerName} status=${b.status}`);
        }
      }
    }
  }

  // Simulate getNextMonthlySerial for June 21
  const d = new Date("2026-06-21T00:00:00.000Z");
  const monthStart = startOfMonthQ(d);
  const monthEnd = endOfMonthQ(d);
  const count = await prisma.booking.count({
    where: { deliveryDate: { gte: monthStart, lt: monthEnd } },
  });
  const maxSerial = await prisma.booking.aggregate({
    where: { deliveryDate: { gte: monthStart, lt: monthEnd } },
    _max: { monthlySerial: true },
  });
  console.log("\nJune 2026 count:", count, "maxSerial:", maxSerial._max.monthlySerial);
}

main().finally(() => prisma.$disconnect());
