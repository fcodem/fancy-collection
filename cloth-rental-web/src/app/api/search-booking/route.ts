import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { bookingSearchWhere, serializeBookingItems } from "@/lib/dress";

export async function GET(request: Request) {
  await getCurrentUser();
  const { searchParams } = new URL(request.url);
  const dateStr = searchParams.get("date") || new Date().toISOString().slice(0, 10);
  const q = (searchParams.get("q") || "").trim();
  const ref = new Date(dateStr);
  const year = ref.getFullYear();
  const month = ref.getMonth();
  const mStart = new Date(year, month, 1);
  const mEnd = new Date(year, month + 1, 1);

  async function getBookings(y: number, m: number) {
    const start = new Date(y, m, 1);
    const end = new Date(y, m + 1, 1);
    return prisma.booking.findMany({
      where: {
        deliveryDate: { gte: start, lt: end },
        status: { in: ["booked", "delivered"] },
        ...(q ? bookingSearchWhere(q) : {}),
      },
      include: { bookingItems: { include: { item: true } }, item: true },
      orderBy: { deliveryDate: "asc" },
    });
  }

  let results = await getBookings(year, month);
  if (!results.length && q) {
    const prevM = month === 0 ? 11 : month - 1;
    const prevY = month === 0 ? year - 1 : year;
    const nextM = month === 11 ? 0 : month + 1;
    const nextY = month === 11 ? year + 1 : year;
    results = [
      ...(await getBookings(prevY, prevM)),
      ...(await getBookings(nextY, nextM)),
    ];
  }

  return NextResponse.json(
    results.map((b) => ({
      id: b.id,
      booking_number: b.bookingNumber,
      serial: b.monthlySerial,
      customer_name: b.customerName,
      contact_1: b.contact1,
      delivery_date: b.deliveryDate.toISOString().slice(0, 10),
      delivery_time: b.deliveryTime,
      return_date: b.returnDate.toISOString().slice(0, 10),
      status: b.status,
      total_price: b.totalPrice,
      venue: b.venue || "",
      items: serializeBookingItems(b),
    }))
  );
}
