import prisma from "@/lib/prisma";
import { whereDeliveryInRange, whereReturnOnAnyDates } from "@/lib/bookingDateQuery";
import { formatDate } from "@/lib/constants";
import { bookingListRecordFrom } from "@/lib/bookingDetails";
import { bookingItemSize, dressDisplayName } from "@/lib/dress";
import { isStarBooking } from "@/lib/starBooking";
import { serializeActiveOrders } from "@/lib/slipBookingData";
import { decodePackingCursor, encodePackingCursor } from "@/lib/packingCursor";
import type { Prisma } from "@prisma/client";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export async function getPackingListPage(opts: {
  deliveryFrom: string;
  deliveryTo?: string;
  category?: string;
  cursor?: string | null;
  limit?: number;
}) {
  const limit = Math.min(MAX_LIMIT, Math.max(1, opts.limit || DEFAULT_LIMIT));
  const category = opts.category?.trim() || "";
  const cursor = decodePackingCursor(opts.cursor);
  const dateWhere = await whereDeliveryInRange(
    opts.deliveryFrom,
    opts.deliveryTo || opts.deliveryFrom,
  );
  const cursorWhere: Prisma.BookingWhereInput = cursor
    ? {
        OR: [
          { deliveryDate: { gt: new Date(cursor.deliveryDate) } },
          {
            deliveryDate: new Date(cursor.deliveryDate),
            deliveryTime: { gt: cursor.deliveryTime },
          },
          {
            deliveryDate: new Date(cursor.deliveryDate),
            deliveryTime: cursor.deliveryTime,
            id: { gt: cursor.id },
          },
        ],
      }
    : {};
  const categoryWhere: Prisma.BookingWhereInput = category
    ? {
        OR: [
          { bookingItems: { some: { category, isCancelled: false } } },
          { bookingItems: { none: {} }, legacyItem: { is: { category } } },
        ],
      }
    : {};

  const bookings = await prisma.booking.findMany({
    where: {
      AND: [{ status: "booked" }, dateWhere, cursorWhere, categoryWhere],
    },
    orderBy: [{ deliveryDate: "asc" }, { deliveryTime: "asc" }, { id: "asc" }],
    take: limit + 1,
    select: {
      id: true,
      monthlySerial: true,
      customerName: true,
      customerAddress: true,
      contact1: true,
      whatsappNo: true,
      deliveryDate: true,
      deliveryTime: true,
      returnDate: true,
      returnTime: true,
      createdAt: true,
      venue: true,
      staffNames: true,
      totalPrice: true,
      totalAdvance: true,
      securityDeposit: true,
      commonNotes: true,
      itemId: true,
      dressName: true,
      price: true,
      notes: true,
      bookingItems: {
        where: {
          isCancelled: false,
          ...(category ? { category } : {}),
        },
        select: {
          id: true,
          itemId: true,
          dressName: true,
          category: true,
          size: true,
          price: true,
          notes: true,
          preparedBy: true,
          checkedBy: true,
          isPackedReady: true,
          packingNote: true,
          item: { select: { size: true } },
        },
      },
      orders: {
        where: { status: "active" },
        select: {
          id: true,
          description: true,
          cost: true,
          advance: true,
          balance: true,
          deliveryDate: true,
          deliveryTime: true,
          status: true,
        },
        orderBy: [{ deliveryDate: "asc" }, { id: "asc" }],
      },
      legacyItem: { select: { size: true, category: true } },
    },
  });

  const hasMore = bookings.length > limit;
  const visible = bookings.slice(0, limit);
  const visibleItemIds = [
    ...new Set(
      visible.flatMap((booking) =>
        booking.bookingItems.length
          ? booking.bookingItems.flatMap((item) => item.itemId == null ? [] : [item.itemId])
          : booking.itemId == null
            ? []
            : [booking.itemId],
      ),
    ),
  ];
  const deliveryDays = [
    ...new Set(visible.map((booking) => formatDate(booking.deliveryDate, "iso"))),
  ];

  const returning =
    visibleItemIds.length && deliveryDays.length
      ? await prisma.booking.findMany({
          where: {
            status: { in: ["booked", "delivered"] },
            ...(await whereReturnOnAnyDates(deliveryDays)),
            OR: [
              {
                bookingItems: {
                  some: {
                    itemId: { in: visibleItemIds },
                    isCancelled: false,
                    isReturned: false,
                  },
                },
              },
              { bookingItems: { none: {} }, itemId: { in: visibleItemIds } },
            ],
          },
          take: Math.min(250, Math.max(25, visibleItemIds.length * 4)),
          select: {
            id: true,
            monthlySerial: true,
            customerName: true,
            contact1: true,
            deliveryDate: true,
            deliveryTime: true,
            returnDate: true,
            returnTime: true,
            bookingItems: {
              where: { itemId: { in: visibleItemIds }, isCancelled: false, isReturned: false },
              select: { itemId: true },
            },
            itemId: true,
          },
        })
      : [];

  const warningByDayItem = new Map<string, (typeof returning)[number]>();
  for (const booking of returning) {
    const day = formatDate(booking.returnDate, "iso");
    const ids = booking.bookingItems.length
      ? booking.bookingItems.flatMap((item) => item.itemId == null ? [] : [item.itemId])
      : booking.itemId == null
        ? []
        : [booking.itemId];
    for (const itemId of ids) warningByDayItem.set(`${day}:${itemId}`, booking);
  }

  const results = visible.flatMap((booking) => {
    const items = booking.bookingItems.length
      ? booking.bookingItems.map((item) => {
          const warning = item.itemId == null
            ? null
            : warningByDayItem.get(`${formatDate(booking.deliveryDate, "iso")}:${item.itemId}`);
          return {
            bi_id: item.id,
            dress_name: item.dressName,
            display_name: dressDisplayName(
              item.dressName,
              item.category,
              bookingItemSize(item),
            ),
            category: item.category || "",
            size: bookingItemSize(item),
            prepared_by: item.preparedBy || "",
            checked_by: item.checkedBy || "",
            is_packed_ready: item.isPackedReady,
            packing_note: item.packingNote || "",
            returning_warning: warning
              ? {
                  id: warning.id,
                  booking_id: warning.id,
                  serial_no: warning.monthlySerial,
                  customer_name: warning.customerName,
                  customer_address: "",
                  contact_1: warning.contact1,
                  whatsapp_no: "",
                  venue: "",
                  staff_names: "",
                  total_rent: 0,
                  total_advance: 0,
                  security_deposit: 0,
                  dress_names: "",
                  item_notes: "",
                  common_notes: "",
                  delivery_date: formatDate(warning.deliveryDate, "display"),
                  delivery_time: warning.deliveryTime,
                  return_date: formatDate(warning.returnDate, "display"),
                  return_time: warning.returnTime,
                  booking_date: "",
                  booking_time: "",
                  is_star: false,
                }
              : null,
          };
        })
      : booking.dressName && !category
        ? [{
            bi_id: null,
            dress_name: booking.dressName,
            display_name: booking.dressName,
            category: booking.legacyItem?.category || "",
            size: booking.legacyItem?.size || "",
            prepared_by: "",
            checked_by: "",
            is_packed_ready: false,
            packing_note: "",
            returning_warning: null,
          }]
        : [];
    if (!items.length && (category || !booking.orders.length)) return [];
    return [{
      ...bookingListRecordFrom(booking),
      id: booking.id,
      serial_no: booking.monthlySerial,
      is_star: isStarBooking(booking),
      items,
      orders: category
        ? []
        : serializeActiveOrders(booking.orders as Parameters<typeof serializeActiveOrders>[0]),
    }];
  });

  const last = visible[visible.length - 1];
  return {
    results,
    hasMore,
    nextCursor:
      hasMore && last
        ? encodePackingCursor({
            deliveryDate: last.deliveryDate.toISOString(),
            deliveryTime: last.deliveryTime,
            id: last.id,
          })
        : null,
    limit,
  };
}
