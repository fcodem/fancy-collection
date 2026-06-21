import prisma from "../src/lib/prisma";
import { whereDeliveryInRange } from "../src/lib/bookingDateQuery";
import { serialPositionToValue } from "../src/lib/serial";
import { formatDate } from "../src/lib/constants";

function lastDayOfMonth(y: number, m: number): string {
  const d = new Date(Date.UTC(y, m, 0));
  return formatDate(d, "iso");
}

function createdAtMsColumn(): string {
  return `(CASE typeof(created_at) WHEN 'integer' THEN created_at ELSE (unixepoch(substr(created_at, 1, 19)) * 1000) END)`;
}

async function repairMonth(monthKey: string) {
  const [y, m] = monthKey.split("-").map(Number);
  const fromStr = `${monthKey}-01`;
  const toStr = lastDayOfMonth(y, m);
  const where = await whereDeliveryInRange(fromStr, toStr);

  const ids = await prisma.booking.findMany({
    where,
    select: { id: true },
  });
  if (!ids.length) return;

  const idList = ids.map((r) => r.id).join(",");
  const ordered = await prisma.$queryRawUnsafe<{ id: number; monthly_serial: number; customer_name: string }[]>(
    `SELECT id, monthly_serial, customer_name FROM bookings WHERE id IN (${idList}) ORDER BY ${createdAtMsColumn()} ASC, id ASC`,
  );

  for (let i = 0; i < ordered.length; i++) {
    const expected = serialPositionToValue(i + 1);
    const b = ordered[i];
    if (b.monthly_serial !== expected) {
      console.log(`Fix id=${b.id} ${b.customer_name}: #${b.monthly_serial} -> #${expected}`);
      await prisma.booking.update({ where: { id: b.id }, data: { monthlySerial: expected } });
    }
  }
}

async function main() {
  const months = await prisma.$queryRaw<{ month: string }[]>`
    SELECT DISTINCT substr(
      CASE typeof(delivery_date)
        WHEN 'integer' THEN datetime(delivery_date / 1000, 'unixepoch')
        ELSE substr(delivery_date, 1, 10)
      END,
      1, 7
    ) AS month
    FROM bookings
    ORDER BY month
  `;

  for (const { month } of months) {
    if (!month) continue;
    console.log(`\nRepairing ${month}...`);
    await repairMonth(month);
  }
}

main().finally(() => prisma.$disconnect());
