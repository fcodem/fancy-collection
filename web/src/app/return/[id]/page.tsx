import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import ServerAppShell from "@/components/ServerAppShell";
import ReturnDetailClient from "@/components/ReturnDetailClient";
import { serializeBookingItemRows } from "@/lib/dress";
import { formatDate } from "@/lib/constants";
export default async function ReturnDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const booking = await prisma.booking.findUnique({
    where: { id: parseInt(id, 10) },
    include: { bookingItems: { include: { item: true } }, legacyItem: true },
  });
  if (!booking) notFound();

  const items = serializeBookingItemRows(booking);

  return (
    <ServerAppShell>
      <ReturnDetailClient
        booking={{
          ...booking,
          deliveryDate: formatDate(booking.deliveryDate),
          returnDate: formatDate(booking.returnDate),
        }}
        items={items}
      />
    </ServerAppShell>
  );
}
