import { notFound } from "next/navigation";
import DeliveryDetailClient from "@/components/DeliveryDetailClient";
import DeliveredBookingEditSection from "@/components/DeliveredBookingEditSection";
import { getDeliveryDetail } from "@/lib/services/operations";
import { formatDate } from "@/lib/constants";
import { loadWarningItemsForBooking } from "@/lib/bookingWarnings";

export const dynamic = "force-dynamic";

export default async function DeliveryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bookingId = parseInt(id, 10);
  const detail = await getDeliveryDetail(bookingId);
  if (!detail) notFound();
  const { booking, next_bookings } = detail;
  const warningItems = await loadWarningItemsForBooking(booking);

  const items = booking.bookingItems.map((bi) => ({
    id: bi.id,
    itemId: bi.itemId,
    dressName: bi.dressName,
    category: bi.category,
    size: bi.size || bi.item?.size,
    price: bi.price,
    remaining: bi.remaining,
    photo: bi.item?.photo || "",
    isDelivered: bi.isDelivered,
    itemRemainingCollected: bi.itemRemainingCollected,
    itemSecurityCollected: bi.itemSecurityCollected,
    itemDeliveryNotes: bi.itemDeliveryNotes,
    preparedBy: bi.preparedBy || "",
    checkedBy: bi.checkedBy || "",
    packingNote: bi.packingNote || "",
  }));

  const orderRecords = (booking.orders ?? [])
    .filter((o) => o.status === "active")
    .map((o) => ({
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
    }));

  const allDelivered = items.length > 0 ? items.every((i) => i.isDelivered) : booking.status === "delivered";
  const isDelivered = allDelivered;

  return (
    <>
      <DeliveryDetailClient
        booking={{
          ...booking,
          deliveryDate: formatDate(booking.deliveryDate),
          returnDate: formatDate(booking.returnDate),
        }}
        items={items}
        warningItems={warningItems}
        nextBookings={next_bookings}
        isDelivered={isDelivered}
        idPhoto1={booking.idPhoto1}
        idPhoto2={booking.idPhoto2}
        orders={orderRecords}
      />
      {isDelivered && <DeliveredBookingEditSection bookingId={booking.id} />}
    </>
  );
}
