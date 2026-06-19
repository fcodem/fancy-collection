import { redirect, notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import ServerAppShell from "@/components/ServerAppShell";
import BookingFormClient from "@/components/BookingFormClient";
import { getAllCategories } from "@/lib/categories";
import { todayIso } from "@/lib/constants";

export default async function EditBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (id === "new") redirect("/booking/new");
  const booking = await prisma.booking.findUnique({
    where: { id: parseInt(id, 10) },
    include: { bookingItems: { include: { item: true } } },
  });
  if (!booking) notFound();

  if (booking.status === "delivered") {
    redirect(`/booking-delivery/${booking.id}`);
  }

  const cats = await getAllCategories();
  const staff = await prisma.staff.findMany({ where: { active: true }, orderBy: { name: "asc" } });

  return (
    <ServerAppShell>
      <BookingFormClient
        today={todayIso()}
        editId={booking.id}
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
    </ServerAppShell>
  );
}
