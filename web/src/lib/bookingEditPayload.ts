import prisma from "./prisma";
import { getAllCategories } from "./categories";
import { getActiveStaffNames } from "./staffList";
import { catalogPhotoRef } from "./catalogPhotoRef";
import { photoUrl, pickInventoryThumbRef } from "./photoUrl";

const itemInclude = {
  bookingItems: {
    include: {
      item: { select: { size: true, photo: true, thumbnailPhoto: true, color: true } },
    },
  },
  orders: { where: { status: "active" as const }, orderBy: { id: "asc" as const } },
} as const;

export async function loadBookingEditFormPayload(bookingId: number) {
  const [booking, cats, staffList] = await Promise.all([
    prisma.booking.findUnique({
      where: { id: bookingId },
      include: itemInclude,
    }),
    getAllCategories(),
    getActiveStaffNames(),
  ]);

  if (!booking) return null;

  return {
    staffList,
    mensCategories: cats.mens_categories,
    womensCategories: cats.womens_categories,
    jewelleryCategories: cats.jewellery_categories,
    accessoryCategories: cats.accessory_categories,
    initial: {
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
        photo: bi.item
          ? photoUrl(
              pickInventoryThumbRef(bi.item.thumbnailPhoto, catalogPhotoRef(bi.item)) ||
                catalogPhotoRef(bi.item),
            ) || ""
          : "",
        price: bi.price,
        fittingCharges: bi.fittingCharges || 0,
        advance: bi.advance,
        notes: bi.notes || "",
      })),
      orders: booking.orders.map((o) => ({
        id: o.id,
        description: o.description,
        cost: o.cost,
        advance: o.advance,
        advance_payment_mode: (o.advancePaymentMode === "online" ? "online" : "cash") as
          | "cash"
          | "online",
        photo: o.photo || "",
        delivery_date: o.deliveryDate.toISOString().slice(0, 10),
        delivery_time: o.deliveryTime,
      })),
    },
  };
}
