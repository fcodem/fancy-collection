import { notFound } from "next/navigation";
import ServerAppShell from "@/components/ServerAppShell";
import DeliveryDetailClient from "@/components/DeliveryDetailClient";
import DeliveredBookingEditSection from "@/components/DeliveredBookingEditSection";
import { getDeliveryDetail } from "@/lib/services/operations";
import { formatDate } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function DeliveryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bookingId = parseInt(id, 10);
  const detail = await getDeliveryDetail(bookingId);
  if (!detail) notFound();
  const { booking, next_bookings } = detail;

  const items = booking.bookingItems.map((bi) => ({
    id: bi.id,
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

  const allDelivered = items.length > 0 ? items.every((i) => i.isDelivered) : booking.status === "delivered";
  const isDelivered = allDelivered;

  return (
    <ServerAppShell>
      <DeliveryDetailClient
        booking={{
          ...booking,
          deliveryDate: formatDate(booking.deliveryDate),
          returnDate: formatDate(booking.returnDate),
        }}
        items={items}
        nextBookings={next_bookings}
        isDelivered={isDelivered}
        idPhoto1={booking.idPhoto1}
        idPhoto2={booking.idPhoto2}
      />
      {isDelivered && <DeliveredBookingEditSection bookingId={booking.id} />}
    </ServerAppShell>
  );
}
