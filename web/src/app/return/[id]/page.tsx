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
  const itemDelivery = booking.bookingItems.map((bi) => ({
    dressName: bi.dressName,
    category: bi.category,
    size: bi.size || bi.item?.size || "",
    photo: bi.item?.photo || "",
    isDelivered: bi.isDelivered,
    isPackedReady: bi.isPackedReady,
    preparedBy: bi.preparedBy || "",
    checkedBy: bi.checkedBy || "",
    packingNote: bi.packingNote || "",
    itemRemainingCollected: bi.itemRemainingCollected,
    itemSecurityCollected: bi.itemSecurityCollected,
    itemDeliveryNotes: bi.itemDeliveryNotes,
  }));

  return (
    <ServerAppShell>
      <ReturnDetailClient
        booking={{
          ...booking,
          deliveryDate: formatDate(booking.deliveryDate),
          returnDate: formatDate(booking.returnDate),
          deliveryNotes: booking.deliveryNotes,
          idPhoto1: booking.idPhoto1,
          idPhoto2: booking.idPhoto2,
        }}
        items={items}
        itemDelivery={itemDelivery}
      />
    </ServerAppShell>
  );
}
