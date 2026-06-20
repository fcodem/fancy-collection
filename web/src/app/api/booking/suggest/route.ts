import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { dressDisplayName } from "@/lib/dress";
import { parseDate } from "@/lib/constants";
import { jsonOk, requireUser, isResponse } from "@/lib/api";

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const q = req.nextUrl.searchParams.get("q")?.trim() || "";
  const date = req.nextUrl.searchParams.get("date") || "";
  const mode = req.nextUrl.searchParams.get("mode") || "delivery";
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "12", 10), 20);

  if (!q || q.length < 1) return jsonOk([]);

  const statusFilter = mode === "return"
    ? { in: ["delivered" as const, "booked" as const] }
    : { in: ["booked" as const] };

  let bookings = await prisma.booking.findMany({
    where: { status: statusFilter },
    include: { bookingItems: { include: { item: true } } },
    orderBy: { monthlySerial: "desc" },
    take: 150,
  });

  const lower = q.toLowerCase();
  const digits = q.replace(/\D/g, "");

  bookings = bookings.filter((b) => {
    if (/^\d+$/.test(q)) {
      if (String(b.monthlySerial).startsWith(q)) return true;
      if (b.monthlySerial === parseInt(q, 10)) return true;
    }
    if (digits.length >= 7 && (b.contact1?.includes(digits) || b.whatsappNo?.includes(digits))) return true;
    if (b.customerName.toLowerCase().includes(lower)) return true;
    const dresses = b.bookingItems.length
      ? b.bookingItems.map((bi) => dressDisplayName(bi.dressName, bi.category, bi.size || bi.item?.size))
      : b.dressName ? [b.dressName] : [];
    return dresses.some((d) => d.toLowerCase().includes(lower));
  });

  if (date) {
    const ref = parseDate(date);
    const refMs = ref.getTime();
    bookings.sort((a, b) => {
      const aDate = mode === "return" ? a.returnDate : a.deliveryDate;
      const bDate = mode === "return" ? b.returnDate : b.deliveryDate;
      return Math.abs(aDate.getTime() - refMs) - Math.abs(bDate.getTime() - refMs);
    });
  }

  return jsonOk(
    bookings.slice(0, limit).map((b) => {
      const dresses = b.bookingItems.length
        ? b.bookingItems.map((bi) => dressDisplayName(bi.dressName, bi.category, bi.size || bi.item?.size)).join(", ")
        : b.dressName || "";
      return {
        id: b.id,
        serial: b.monthlySerial,
        label: `#${String(b.monthlySerial).padStart(2, "0")} — ${b.customerName}`,
        meta: dresses,
        customer_name: b.customerName,
      };
    })
  );
}
