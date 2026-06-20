import prisma from "@/lib/prisma";
import { jsonOk, requireUser, isResponse } from "@/lib/api";
import { formatInr } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireUser();
  if (isResponse(user)) return user;

  const bookings = await prisma.booking.findMany({
    where: { status: { not: "cancelled" } },
    include: {
      bookingItems: { select: { dressName: true, category: true, price: true } },
    },
    orderBy: { deliveryDate: "asc" },
  });

  const events = bookings.map((b) => {
    const dressNames = b.bookingItems.length
      ? b.bookingItems.map((bi) => bi.dressName).join(", ")
      : b.dressName || "—";

    const end = new Date(b.returnDate);
    end.setUTCDate(end.getUTCDate() + 1);

    return {
      id: String(b.id),
      title: `${b.customerName} — ${dressNames}`,
      start: b.deliveryDate.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
      status: b.status,
      serial: b.monthlySerial,
      customer: b.customerName,
      phone: b.contact1,
      whatsapp: b.whatsappNo || "",
      venue: b.venue || "",
      dresses: dressNames,
      totalPrice: b.totalPrice,
      totalAdvance: b.totalAdvance,
      totalRemaining: b.totalRemaining,
      deliveryTime: b.deliveryTime,
      returnTime: b.returnTime,
      deliveryDate: b.deliveryDate.toISOString().slice(0, 10),
      returnDate: b.returnDate.toISOString().slice(0, 10),
      priceDisplay: `₹${formatInr(b.totalPrice)}`,
      advanceDisplay: `₹${formatInr(b.totalAdvance)}`,
      remainingDisplay: `₹${formatInr(b.totalRemaining)}`,
    };
  });

  return jsonOk(events);
}
