import BookingCalendarClient, { type CalendarEvent } from "@/components/admin/BookingCalendarClient";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function AdminCalendarPage() {
  const bookings = await prisma.booking.findMany({
    where: { status: { not: "cancelled" } },
    include: {
      bookingItems: { select: { dressName: true } },
    },
    orderBy: { deliveryDate: "asc" },
  });

  const events: CalendarEvent[] = bookings.map((b) => {
    const dressNames = b.bookingItems.length
      ? b.bookingItems.map((bi) => bi.dressName).join(", ")
      : b.dressName || "—";

    return {
      id: b.id,
      title: `${b.customerName} - ${dressNames}`,
      start: toIsoDate(b.deliveryDate),
      end: toIsoDate(b.returnDate),
      status: b.status,
      serial: b.monthlySerial,
      customerName: b.customerName,
      dresses: dressNames,
    };
  });

  return <BookingCalendarClient events={events} />;
}
