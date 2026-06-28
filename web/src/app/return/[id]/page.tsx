import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import ReturnDetailClient from "@/components/ReturnDetailClient";
import { serializeBookingItemRows } from "@/lib/dress";
import { formatDate } from "@/lib/constants";
import { loadWarningItemsForBooking } from "@/lib/bookingWarnings";
export default async function ReturnDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const booking = await prisma.booking.findUnique({
    where: { id: parseInt(id, 10) },
    include: {
      bookingItems: {
        include: { item: { select: { photo: true, size: true, color: true, category: true } } },
      },
      legacyItem: { select: { photo: true, size: true, category: true } },
    },
  });
  if (!booking) notFound();

  const warningItems = await loadWarningItemsForBooking(booking);

  const items = serializeBookingItemRows(booking);
  const itemDelivery = booking.bookingItems.length
    ? booking.bookingItems.map((bi) => ({
        id: bi.id,
        itemId: bi.itemId,
        dressName: bi.dressName,
        category: bi.category,
        size: bi.size || bi.item?.size || "",
        photo: bi.item?.photo || "",
        isDelivered: bi.isDelivered || booking.status === "delivered",
        isReturned: bi.isReturned,
        isIncompleteReturn: bi.isIncompleteReturn,
        isPackedReady: bi.isPackedReady,
        preparedBy: bi.preparedBy || "",
        checkedBy: bi.checkedBy || "",
        packingNote: bi.packingNote || "",
        itemRemainingCollected: bi.itemRemainingCollected,
        itemSecurityCollected: bi.itemSecurityCollected,
        itemDeliveryNotes: bi.itemDeliveryNotes,
        itemIncompleteNotes: bi.itemIncompleteNotes,
        itemIncompletePhoto: bi.itemIncompletePhoto,
        itemSecurityHeld: bi.itemSecurityHeld,
      }))
    : booking.dressName
      ? [{
          id: 0,
          dressName: booking.dressName,
          category: booking.legacyItem?.category || "",
          size: booking.legacyItem?.size || "",
          photo: booking.legacyItem?.photo || "",
          isDelivered: booking.status === "delivered",
          isReturned: booking.status === "returned",
          isIncompleteReturn: booking.status === "incomplete_return",
          itemRemainingCollected: booking.remainingCollected,
          itemSecurityCollected: booking.securityCollected,
          itemDeliveryNotes: booking.deliveryNotes,
          itemIncompleteNotes: booking.incompleteNotes,
          itemIncompletePhoto: booking.incompletePhoto,
          itemSecurityHeld: booking.securityHeld,
        }]
      : [];

  return (
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
        warningItems={warningItems}
      />
  );
}
