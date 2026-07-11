import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import ReturnDetailClient from "@/components/ReturnDetailClient";
import { serializeBookingItemRows } from "@/lib/dress";
import { formatDate } from "@/lib/constants";
import { loadWarningItemsForBooking } from "@/lib/bookingWarnings";
import { serializeActiveOrders } from "@/lib/slipBookingData";
import { catalogPhotoRef } from "@/lib/catalogPhotoRef";
export default async function ReturnDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const booking = await prisma.booking.findUnique({
    where: { id: parseInt(id, 10) },
    include: {
      bookingItems: {
        include: { item: { select: { photo: true, enhancedPhoto: true, size: true, color: true, category: true } } },
      },
      legacyItem: { select: { photo: true, enhancedPhoto: true, size: true, category: true } },
      orders: { where: { status: "active" }, orderBy: { deliveryDate: "asc" } },
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
        photo: bi.item ? catalogPhotoRef(bi.item) : "",
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
          photo: booking.legacyItem ? catalogPhotoRef(booking.legacyItem) : "",
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
        orders={serializeActiveOrders(booking.orders)}
        orderRecords={(booking.orders ?? []).map((o) => ({
          id: o.id,
          description: o.description,
          cost: o.cost,
          advance: o.advance,
          balance: Math.max(0, o.balance),
          balanceCollected: o.balanceCollected,
          photo: o.photo,
          deliveryDate: formatDate(o.deliveryDate),
          deliveryTime: o.deliveryTime,
          includedInRent: (o.cost || 0) === 0,
        }))}
      />
  );
}
