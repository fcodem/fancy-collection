import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import ServerAppShell from "@/components/ServerAppShell";
import DeliveryDetailClient from "@/components/DeliveryDetailClient";
import BookingFormClient from "@/components/BookingFormClient";
import { getDeliveryDetail } from "@/lib/services/operations";
import { getAllCategories } from "@/lib/categories";
import { formatDate, todayIso } from "@/lib/constants";

export default async function DeliveryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bookingId = parseInt(id, 10);
  const detail = await getDeliveryDetail(bookingId);
  if (!detail) notFound();
  const { booking, next_bookings } = detail;

  const isDelivered = booking.status === "delivered";
  let editForm = null;

  if (isDelivered) {
    const cats = await getAllCategories();
    const staff = await prisma.staff.findMany({ where: { active: true }, orderBy: { name: "asc" } });

    editForm = (
      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-header">
          <h3 className="card-title">Edit Booking &amp; Change Dress</h3>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
            Availability warnings match the new booking panel. Previous dress is freed when changed.
          </span>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          <BookingFormClient
            today={todayIso()}
            editId={booking.id}
            afterSaveHref={`/booking-delivery/${booking.id}`}
            initial={{
              monthly_serial: booking.monthlySerial,
              customer_name: booking.customerName,
              customer_address: booking.customerAddress,
              contact_1: booking.contact1,
              whatsapp_no: booking.whatsappNo || "",
              venue: booking.venue || "",
              security_deposit: booking.securityDeposit,
              common_notes: booking.commonNotes || "",
              staff_names: booking.staffNames ? booking.staffNames.split(", ") : [],
              delivery_date: booking.deliveryDate.toISOString().slice(0, 10),
              delivery_time: booking.deliveryTime,
              return_date: booking.returnDate.toISOString().slice(0, 10),
              return_time: booking.returnTime,
              items: booking.bookingItems.map((bi) => ({
                id: bi.itemId,
                name: bi.dressName,
                category: bi.category || "",
                size: bi.size || bi.item?.size || "",
                color: bi.item?.color || "",
                photo: bi.item?.photo || "",
                price: bi.price,
                advance: bi.advance,
                notes: bi.notes || "",
              })),
            }}
            staffList={staff.map((s) => s.name)}
            mensCategories={cats.mens_categories}
            womensCategories={cats.womens_categories}
            jewelleryCategories={cats.jewellery_categories}
            accessoryCategories={cats.accessory_categories}
          />
        </div>
      </div>
    );
  }

  return (
    <ServerAppShell>
      <DeliveryDetailClient
        booking={{
          ...booking,
          deliveryDate: formatDate(booking.deliveryDate),
          returnDate: formatDate(booking.returnDate),
        }}
        nextBookings={next_bookings}
        isDelivered={isDelivered}
      />
      {editForm}
    </ServerAppShell>
  );
}
