import { NextRequest } from "next/server";
import prisma, { parseDateQ } from "@/lib/prisma";
import { buildDressSearchWhere, dressDisplayName } from "@/lib/dress";
import { bookingUsesItem } from "@/lib/booking";
import { parseDate, formatDate } from "@/lib/constants";
import { jsonError, jsonOk, requireUser, isResponse } from "@/lib/api";
import type { Booking, BookingItem, ClothingItem } from "@prisma/client";

type BookingWithItems = Booking & { bookingItems: BookingItem[] };

function serializeBookingConflict(b: Booking) {
  return {
    customer: b.customerName,
    serial_no: b.monthlySerial,
    delivery_date: formatDate(b.deliveryDate, "iso"),
    delivery_time: b.deliveryTime,
    return_date: formatDate(b.returnDate, "iso"),
    return_time: b.returnTime,
    venue: b.venue || "",
    total_rent: b.totalPrice || b.price,
    contact: b.contact1 || "",
    booking_id: b.id,
  };
}

function checkItemAvailabilityInMemory(
  item: ClothingItem,
  dDate: Date,
  rDate: Date,
  overlappingBookings: BookingWithItems[],
) {
  if (item.status === "maintenance") {
    return {
      status: "not_available" as const,
      reason: "Item is under maintenance",
      returning_warning: null,
      booked_warning: null,
      blocking_booking: null,
    };
  }

  const dIso = formatDate(dDate, "iso");
  const rIso = formatDate(rDate, "iso");

  let returning_warning: ReturnType<typeof serializeBookingConflict> & { return_time?: string } | null = null;
  let booked_warning: ReturnType<typeof serializeBookingConflict> | null = null;
  let blocking_booking: ReturnType<typeof serializeBookingConflict> | null = null;

  for (const b of overlappingBookings) {
    if (!bookingUsesItem(b, item.id)) continue;
    const bD = formatDate(b.deliveryDate, "iso");
    const bR = formatDate(b.returnDate, "iso");
    if (bR === dIso) {
      returning_warning = { ...serializeBookingConflict(b), return_time: b.returnTime };
      continue;
    }
    if (bD === rIso) {
      booked_warning = serializeBookingConflict(b);
      continue;
    }
    blocking_booking = serializeBookingConflict(b);
    break;
  }

  if (blocking_booking) {
    return {
      status: "not_available" as const,
      reason: "Booked during selected dates",
      returning_warning,
      booked_warning,
      blocking_booking,
    };
  }

  if (returning_warning || booked_warning) {
    return {
      status: "available_with_warning" as const,
      reason: "Available with scheduling note",
      returning_warning,
      booked_warning,
      blocking_booking: null,
    };
  }

  return {
    status: "available" as const,
    reason: "Free for entire period",
    returning_warning: null,
    booked_warning: null,
    blocking_booking: null,
  };
}

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (isResponse(user)) return user;

  const deliveryDateStr = req.nextUrl.searchParams.get("delivery_date") || "";
  const returnDateStr = req.nextUrl.searchParams.get("return_date") || "";
  const dressName = req.nextUrl.searchParams.get("dress_name")?.trim() || "";
  const categoryFilter = req.nextUrl.searchParams.get("category")?.trim() || "";

  if (!deliveryDateStr || !returnDateStr) return jsonError("Delivery and return dates are required.");
  if (!dressName) return jsonError("Dress name is required.");

  const dDate = parseDate(deliveryDateStr);
  const rDate = parseDate(returnDateStr);
  if (rDate < dDate) return jsonError("Return date cannot be before delivery date.");
  const dDateQ = parseDateQ(deliveryDateStr);
  const rDateQ = parseDateQ(returnDateStr);

  const where = buildDressSearchWhere(dressName);
  const items = await prisma.clothingItem.findMany({
    where: {
      ...where,
      ...(categoryFilter ? { category: categoryFilter } : {}),
    },
    orderBy: [{ name: "asc" }, { size: "asc" }],
    take: 100,
  });

  if (!items.length) {
    return jsonOk({
      items: [],
      message: `No dress found matching '${dressName}'${categoryFilter ? ` in ${categoryFilter}` : ""}`,
      delivery_date: deliveryDateStr,
      return_date: returnDateStr,
    });
  }

  const itemIds = items.map((i) => i.id);
  const overlappingBookings = await prisma.booking.findMany({
    where: {
      status: { in: ["booked", "delivered"] },
      deliveryDate: { lte: rDateQ },
      returnDate: { gte: dDateQ },
      OR: [
        { itemId: { in: itemIds } },
        { bookingItems: { some: { itemId: { in: itemIds } } } },
      ],
    },
    select: {
      id: true,
      customerName: true,
      monthlySerial: true,
      deliveryDate: true,
      deliveryTime: true,
      returnDate: true,
      returnTime: true,
      venue: true,
      totalPrice: true,
      price: true,
      contact1: true,
      itemId: true,
      bookingItems: { select: { itemId: true } },
    },
  });

  const results = items.map((item) => {
    const avail = checkItemAvailabilityInMemory(item, dDateQ, rDateQ, overlappingBookings as BookingWithItems[]);
    return {
      id: item.id,
      name: item.name,
      display_name: dressDisplayName(item.name, item.category, item.size),
      sku: item.sku,
      category: item.category,
      size: item.size || "",
      color: item.color || "",
      photo: item.photo || "",
      inventory_status: item.status,
      ...avail,
    };
  });

  return jsonOk({
    items: results,
    message: `Found ${results.length} matching dress(es)`,
    delivery_date: deliveryDateStr,
    return_date: returnDateStr,
    dress_name: dressName,
    category: categoryFilter || "All",
  });
}
