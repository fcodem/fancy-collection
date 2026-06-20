import prisma, { parseDateQ } from "../prisma";
import { Prisma } from "@prisma/client";
import { dressDisplayName, bookingItemSize, serializeBookingItems } from "../dress";
import { serializeStandardBookingDetails } from "../bookingDetails";
import { bookingUsesItem, checkItemAvailabilityForDates, getAvailableItemsApi } from "../booking";
import { parseDate, formatDate } from "../constants";
import { broadcastShopEvent } from "../realtime/broadcast";
import { logActivity, snapshotBooking } from "../activityLog";
import { deleteUploads, saveUpload } from "../upload";

async function clearBookingIdPhotos(booking: { idPhoto1?: string | null; idPhoto2?: string | null }) {
  await deleteUploads([booking.idPhoto1, booking.idPhoto2]);
}

function warnFromBooking(b: {
  customerName: string;
  monthlySerial: number;
  deliveryDate: Date;
  returnDate: Date;
  deliveryTime: string;
  returnTime: string;
  venue: string | null;
  contact1: string | null;
  totalPrice: number;
  price: number;
}) {
  return {
    customer: b.customerName,
    serial_no: b.monthlySerial,
    delivery_date: formatDate(b.deliveryDate, "display"),
    return_date: formatDate(b.returnDate, "display"),
    delivery_time: b.deliveryTime,
    return_time: b.returnTime,
    venue: b.venue || "",
    contact: b.contact1 || "",
    total_rent: b.totalPrice || b.price,
  };
}

type BookingForPackingRecord = Parameters<typeof serializeStandardBookingDetails>[0] & {
  id: number;
  monthlySerial: number;
  contact1?: string | null;
  whatsappNo?: string | null;
  venue?: string | null;
  staffNames?: string | null;
  totalAdvance?: number;
  advance?: number;
};

function packingRecordFromBooking(b: BookingForPackingRecord) {
  const std = serializeStandardBookingDetails(b);
  return {
    id: b.id,
    serial_no: b.monthlySerial,
    contact_1: b.contact1 || "",
    whatsapp_no: b.whatsappNo || "",
    venue: b.venue || "",
    staff_names: b.staffNames || "",
    total_advance: b.totalAdvance ?? b.advance ?? 0,
    ...std,
  };
}

function packingWarningFromBooking(b: BookingForPackingRecord) {
  const row = packingRecordFromBooking(b);
  return {
    booking_id: b.id,
    serial_no: row.serial_no,
    customer_name: row.customer_name,
    customer_address: row.customer_address,
    contact_1: row.contact_1,
    whatsapp_no: row.whatsapp_no,
    venue: row.venue,
    staff_names: row.staff_names,
    delivery_date: row.delivery_date,
    delivery_time: row.delivery_time,
    return_date: row.return_date,
    return_time: row.return_time,
    total_rent: row.total_rent,
    total_advance: row.total_advance,
    dress_names: row.dress_names,
    item_notes: row.item_notes,
    common_notes: row.common_notes,
  };
}

export async function getDashboardFreeItems(deliveryDateStr: string, returnDateStr: string, categoryFilter = "") {
  if (!deliveryDateStr || !returnDateStr) {
    return { free_items: [], returning_on_delivery: [], warnings: {} };
  }
  const dDate = parseDateQ(deliveryDateStr);
  const rDate = parseDateQ(returnDateStr);

  const allItems = await prisma.clothingItem.findMany({
    where: {
      status: { not: "maintenance" },
      ...(categoryFilter ? { category: categoryFilter } : {}),
    },
  });

  const overlappingBookings = await prisma.booking.findMany({
    where: {
      status: { in: ["booked", "delivered"] },
      deliveryDate: { lte: rDate },
      returnDate: { gte: dDate },
    },
    include: { bookingItems: true },
  });

  const bookedItemIds = new Set<number>();
  for (const b of overlappingBookings) {
    if (b.bookingItems.length) b.bookingItems.forEach((bi) => bookedItemIds.add(bi.itemId));
    else if (b.itemId) bookedItemIds.add(b.itemId);
  }

  const overlappingRentals = await prisma.rental.findMany({
    where: {
      status: { in: ["active", "overdue"] },
      startDate: { lte: rDate },
      endDate: { gte: dDate },
    },
    include: { items: true },
  });
  const rentedItemIds = new Set<number>();
  for (const r of overlappingRentals) r.items.forEach((ri) => rentedItemIds.add(ri.itemId));

  const busyIds = new Set([...bookedItemIds, ...rentedItemIds]);

  const returningOnDeliveryBookings = await prisma.booking.findMany({
    where: { status: { in: ["booked", "delivered"] }, returnDate: dDate },
    include: { bookingItems: true },
  });
  const returningOnDeliveryIds = new Set<number>();
  for (const b of returningOnDeliveryBookings) {
    if (b.bookingItems.length) b.bookingItems.forEach((bi) => returningOnDeliveryIds.add(bi.itemId));
    else if (b.itemId) returningOnDeliveryIds.add(b.itemId);
  }

  const bookingsOnReturnDate = await prisma.booking.findMany({
    where: { status: { in: ["booked", "delivered"] }, deliveryDate: rDate },
    include: { bookingItems: true },
  });
  const bookedOnReturnIds = new Set<number>();
  const bookedOnReturnInfo: Record<string, object> = {};
  for (const b of bookingsOnReturnDate) {
    const ids = b.bookingItems.length ? b.bookingItems.map((bi) => bi.itemId) : b.itemId ? [b.itemId] : [];
    for (const bid of ids) {
      bookedOnReturnIds.add(bid);
      bookedOnReturnInfo[String(bid)] = {
        booking_number: b.bookingNumber,
        serial_no: b.monthlySerial,
        customer_name: b.customerName,
        amount: b.totalPrice || b.price,
        delivery_time: b.deliveryTime,
        venue: b.venue || "",
      };
    }
  }

  const trulyBusy = new Set([...busyIds].filter((id) => !returningOnDeliveryIds.has(id) && !bookedOnReturnIds.has(id)));

  const free_items = [];
  const warnings: Record<string, object> = {};
  for (const i of allItems) {
    if (!trulyBusy.has(i.id)) {
      free_items.push({
        id: i.id,
        name: i.name,
        display_name: dressDisplayName(i.name, i.category, i.size),
        category: i.category,
        color: i.color || "",
        size: i.size || "",
      });
      if (bookedOnReturnInfo[String(i.id)]) warnings[String(i.id)] = bookedOnReturnInfo[String(i.id)];
    }
  }

  const returning_on_delivery = [];
  const returnItemIds = new Set<number>();
  for (const b of returningOnDeliveryBookings) {
    if (b.bookingItems.length) b.bookingItems.forEach((bi) => returnItemIds.add(bi.itemId));
    else if (b.itemId) returnItemIds.add(b.itemId);
  }
  const returnItemsById = new Map(
    (await prisma.clothingItem.findMany({ where: { id: { in: [...returnItemIds] } } })).map((i) => [i.id, i])
  );

  for (const b of returningOnDeliveryBookings) {
    const itemsInB = b.bookingItems.length
      ? b.bookingItems.map((bi) => ({ id: bi.itemId, name: bi.dressName, cat: bi.category || "" }))
      : b.itemId ? [{ id: b.itemId, name: b.dressName || "", cat: "" }] : [];
    for (const { id: bid, name: bname, cat: bcat } of itemsInB) {
      const item = returnItemsById.get(bid);
      const cat = bcat || item?.category || "";
      if (categoryFilter && cat !== categoryFilter) continue;
      returning_on_delivery.push({
        id: bid,
        dress_name: bname,
        display_name: dressDisplayName(bname, cat, item?.size),
        category: cat,
        booking_number: b.bookingNumber,
        serial_no: b.monthlySerial,
        customer_name: b.customerName,
        contact: b.contact1,
        amount: b.totalPrice || b.price,
        return_time: b.returnTime,
        return_date: formatDate(b.returnDate, "display"),
        venue: b.venue || "",
      });
    }
  }

  return { free_items, returning_on_delivery, warnings };
}

export async function bookingDateCheck(
  bookingId: number,
  deliveryDateStr: string,
  returnDateStr: string,
  itemIds: number[]
) {
  if (!deliveryDateStr || !returnDateStr || !itemIds.length) return [];
  const dDateRaw = parseDate(deliveryDateStr);
  const rDateRaw = parseDate(returnDateStr);
  if (rDateRaw < dDateRaw) throw new Error("return before delivery");
  const dDate = parseDateQ(deliveryDateStr);
  const rDate = parseDateQ(returnDateStr);

  const results = [];
  for (const itemId of itemIds) {
    const item = await prisma.clothingItem.findUnique({ where: { id: itemId } });
    if (!item) continue;

    const hard = await prisma.booking.findFirst({
      where: {
        id: { not: bookingId },
        status: { in: ["booked", "delivered"] },
        deliveryDate: { lt: rDate },
        returnDate: { gt: dDate },
        AND: [
          { NOT: { returnDate: dDate } },
          { NOT: { deliveryDate: rDate } },
        ],
        OR: [{ bookingItems: { some: { itemId } } }, { itemId }],
      },
    });

    if (hard) {
      results.push({
        item_id: itemId,
        item_name: item.name,
        status: "hard_conflict",
        conflict: warnFromBooking(hard),
      });
      continue;
    }

    const retWarn = await prisma.booking.findFirst({
      where: {
        id: { not: bookingId },
        status: { in: ["booked", "delivered"] },
        returnDate: dDate,
        OR: [{ bookingItems: { some: { itemId } } }, { itemId }],
      },
    });

    const delWarn = await prisma.booking.findFirst({
      where: {
        id: { not: bookingId },
        status: { in: ["booked", "delivered"] },
        deliveryDate: rDate,
        OR: [{ bookingItems: { some: { itemId } } }, { itemId }],
      },
    });

    if (retWarn || delWarn) {
      results.push({
        item_id: itemId,
        item_name: item.name,
        status: retWarn && delWarn ? "both_warnings" : retWarn ? "returning_warning" : "booked_on_return_warning",
        returning_warning: retWarn ? warnFromBooking(retWarn) : null,
        booked_on_return_warning: delWarn ? warnFromBooking(delWarn) : null,
      });
      continue;
    }

    results.push({ item_id: itemId, item_name: item.name, status: "ok", returning_warning: null, booked_on_return_warning: null });
  }
  return results;
}

export async function getPackingList(deliveryDateStr: string, returnDateStr: string, categoryFilter = "") {
  const where: Prisma.BookingWhereInput = { status: "booked" };
  if (deliveryDateStr) {
    const dDate = parseDateQ(deliveryDateStr);
    if (returnDateStr) {
      const rDate = parseDateQ(returnDateStr);
      where.deliveryDate = { gte: dDate, lte: rDate };
    } else {
      where.deliveryDate = dDate;
    }
  }

  const bookings = await prisma.booking.findMany({
    where,
    include: { bookingItems: { include: { item: true } }, legacyItem: true },
    orderBy: [{ deliveryDate: "asc" }, { deliveryTime: "asc" }],
  });

  const deliveryDates = [...new Set(bookings.map((b) => b.deliveryDate.getTime()))];
  type ReturningBooking = Awaited<
    ReturnType<
      typeof prisma.booking.findMany<{
        include: { bookingItems: true };
      }>
    >
  >[number];
  const returningByDeliveryDate = new Map<number, ReturningBooking[]>();
  if (deliveryDates.length) {
    const returningBookings = await prisma.booking.findMany({
      where: {
        returnDate: { in: bookings.map((b) => b.deliveryDate) },
        status: { in: ["booked", "delivered"] },
      },
      include: { bookingItems: { include: { item: true } }, legacyItem: true },
    });
    for (const rb of returningBookings) {
      const key = rb.returnDate.getTime();
      if (!returningByDeliveryDate.has(key)) returningByDeliveryDate.set(key, []);
      returningByDeliveryDate.get(key)!.push(rb);
    }
  }

  const results = [];
  for (const b of bookings) {
    const items_data = [];
    const returning = (returningByDeliveryDate.get(b.deliveryDate.getTime()) || []).filter((rb) => rb.id !== b.id);
    if (b.bookingItems.length) {
      for (const bi of b.bookingItems) {
        if (categoryFilter && bi.category !== categoryFilter) continue;
        const itemObj = bi.item;
        let retWarning = null;
        for (const rb of returning) {
          const rbIds = rb.bookingItems.length ? rb.bookingItems.map((rbi) => rbi.itemId) : rb.itemId ? [rb.itemId] : [];
          if (rbIds.includes(bi.itemId)) {
            retWarning = packingWarningFromBooking(rb);
            break;
          }
        }
        items_data.push({
          bi_id: bi.id,
          dress_name: bi.dressName,
          display_name: dressDisplayName(bi.dressName, bi.category, bookingItemSize(bi)),
          category: bi.category || "",
          size: bookingItemSize(bi),
          price: bi.price,
          advance: bi.advance,
          remaining: bi.remaining,
          notes: bi.notes || "",
          photo: itemObj?.photo || "",
          prepared_by: bi.preparedBy || "",
          checked_by: bi.checkedBy || "",
          is_packed_ready: bi.isPackedReady,
          packing_note: bi.packingNote || "",
          returning_warning: retWarning,
        });
      }
    } else if (b.dressName && !categoryFilter) {
      items_data.push({
        bi_id: null,
        dress_name: b.dressName,
        category: "",
        size: "",
        price: b.price,
        advance: b.advance,
        remaining: b.remaining,
        notes: b.notes || "",
        photo: "",
        prepared_by: "",
        checked_by: "",
        is_packed_ready: false,
        packing_note: "",
        returning_warning: null,
      });
    }
    if (!items_data.length) continue;
    results.push({
      ...packingRecordFromBooking(b),
      items: items_data,
    });
  }
  return results;
}

export async function savePackingItem(
  data: {
    bi_id: number;
    prepared_by?: string;
    checked_by?: string;
    is_packed_ready?: boolean;
    packing_note?: string;
  },
  by?: string,
) {
  const bi = await prisma.bookingItem.findUnique({ where: { id: data.bi_id } });
  if (!bi) throw new Error("Item not found");
  const beforePacking = { preparedBy: bi.preparedBy, checkedBy: bi.checkedBy, isPackedReady: bi.isPackedReady, packingNote: bi.packingNote };
  const updated = await prisma.bookingItem.update({
    where: { id: data.bi_id },
    data: {
      ...(data.prepared_by !== undefined ? { preparedBy: data.prepared_by.trim() || null } : {}),
      ...(data.checked_by !== undefined ? { checkedBy: data.checked_by.trim() || null } : {}),
      ...(data.is_packed_ready !== undefined ? { isPackedReady: Boolean(data.is_packed_ready) } : {}),
      ...(data.packing_note !== undefined ? { packingNote: data.packing_note.trim() || null } : {}),
    },
  });
  broadcastShopEvent({ type: "packing.updated", bookingId: bi.bookingId, by });
  logActivity({
    username: by || "system",
    action: "packed",
    entity: "booking_item",
    entityId: bi.bookingId,
    label: `Packing update — ${bi.dressName} (Booking #${bi.bookingId})`,
    before: beforePacking as unknown as Record<string, unknown>,
    after: { preparedBy: updated.preparedBy, checkedBy: updated.checkedBy, isPackedReady: updated.isPackedReady, packingNote: updated.packingNote } as unknown as Record<string, unknown>,
  });
  return {
    ok: true,
    prepared_by: updated.preparedBy || "",
    checked_by: updated.checkedBy || "",
    is_packed_ready: updated.isPackedReady,
    packing_note: updated.packingNote || "",
  };
}

export async function saveDelivery(
  bookingId: number,
  data: {
    remaining_collected?: number;
    security_collected?: number;
    delivery_notes?: string;
    mark_delivered?: boolean;
    items?: Array<{
      booking_item_id: number;
      remaining_collected: number;
      security_collected: number;
      delivery_notes: string;
      mark_delivered?: boolean;
      update_only?: boolean;
    }>;
  },
  by?: string,
) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { bookingItems: true },
  });
  if (!booking) throw new Error("Booking not found");
  const beforeDelivery = snapshotBooking(booking as unknown as Record<string, unknown>);

  if (data.items?.length) {
    const allNotes: string[] = [];

    for (const item of data.items) {
      const bi = booking.bookingItems.find((b) => b.id === item.booking_item_id);
      if (!bi) continue;

      const itemUpdate: {
        itemRemainingCollected: number;
        itemSecurityCollected: number;
        itemDeliveryNotes: string | null;
        isDelivered?: boolean;
        deliveredAt?: Date;
      } = {
        itemRemainingCollected: item.remaining_collected,
        itemSecurityCollected: item.security_collected,
        itemDeliveryNotes: item.delivery_notes?.trim() || null,
      };

      if (item.mark_delivered && !bi.isDelivered) {
        itemUpdate.isDelivered = true;
        itemUpdate.deliveredAt = new Date();
      }

      await prisma.bookingItem.update({
        where: { id: bi.id },
        data: itemUpdate,
      });

      if (item.delivery_notes?.trim()) allNotes.push(`${bi.dressName}: ${item.delivery_notes.trim()}`);
    }

    const refreshed = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { bookingItems: true },
    });
    if (!refreshed) throw new Error("Booking not found");

    const totalRemaining = refreshed.bookingItems.reduce((s, bi) => s + bi.itemRemainingCollected, 0);
    const totalSecurity = refreshed.bookingItems.reduce((s, bi) => s + bi.itemSecurityCollected, 0);
    // Build fresh notes from current item notes only (don't accumulate)
    const newNotes = allNotes.length ? allNotes.join(" | ") : (refreshed.deliveryNotes || "");

    const allDelivered = refreshed.bookingItems.length > 0 && refreshed.bookingItems.every((bi) => bi.isDelivered);
    const anyDelivered = refreshed.bookingItems.some((bi) => bi.isDelivered);

    const result = await prisma.booking.update({
      where: { id: bookingId },
      data: {
        remainingCollected: totalRemaining,
        securityCollected: totalSecurity,
        deliveryNotes: newNotes || data.delivery_notes || booking.deliveryNotes,
        ...(allDelivered && anyDelivered
          ? { status: "delivered", deliveredAt: booking.deliveredAt || new Date() }
          : {}),
      },
    });
    broadcastShopEvent({ type: "booking.delivered", bookingId, status: result.status, by });
    logActivity({
      username: by || "system",
      action: "delivered",
      entity: "booking",
      entityId: bookingId,
      label: `Delivery — Booking #${String(booking.monthlySerial).padStart(2, "0")} — ${booking.customerName}`,
      before: beforeDelivery,
      after: snapshotBooking(result as unknown as Record<string, unknown>),
    });
    return result;
  }

  if (data.mark_delivered && booking.status === "booked") {
    await prisma.bookingItem.updateMany({
      where: { bookingId },
      data: { isDelivered: true, deliveredAt: new Date() },
    });
  }

  const result = await prisma.booking.update({
    where: { id: bookingId },
    data: {
      remainingCollected: data.remaining_collected ?? booking.remainingCollected,
      securityCollected: data.security_collected ?? booking.securityCollected,
      deliveryNotes: data.delivery_notes ?? booking.deliveryNotes,
      ...(data.mark_delivered && booking.status === "booked"
        ? { status: "delivered", deliveredAt: new Date() }
        : {}),
    },
  });
  broadcastShopEvent({ type: "booking.delivered", bookingId, status: result.status, by });
  logActivity({
    username: by || "system",
    action: "delivered",
    entity: "booking",
    entityId: bookingId,
    label: `Delivery — Booking #${String(booking.monthlySerial).padStart(2, "0")} — ${booking.customerName}`,
    before: beforeDelivery,
    after: snapshotBooking(result as unknown as Record<string, unknown>),
  });
  return result;
}

export async function saveDeliveryIdPhotos(
  bookingId: number,
  data: { id_photo_1?: File | null; id_photo_2?: File | null },
  by?: string,
) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throw new Error("Booking not found");

  let idPhoto1 = booking.idPhoto1;
  let idPhoto2 = booking.idPhoto2;

  if (data.id_photo_1 instanceof File && data.id_photo_1.size > 0) {
    if (idPhoto1) await deleteUploads([idPhoto1]);
    idPhoto1 = await saveUpload(data.id_photo_1);
  }
  if (data.id_photo_2 instanceof File && data.id_photo_2.size > 0) {
    if (idPhoto2) await deleteUploads([idPhoto2]);
    idPhoto2 = await saveUpload(data.id_photo_2);
  }

  const result = await prisma.booking.update({
    where: { id: bookingId },
    data: { idPhoto1, idPhoto2 },
  });

  logActivity({
    username: by || "system",
    action: "updated",
    entity: "booking",
    entityId: bookingId,
    label: `ID photos — Booking #${String(booking.monthlySerial).padStart(2, "0")} — ${booking.customerName}`,
    before: { idPhoto1: booking.idPhoto1, idPhoto2: booking.idPhoto2 },
    after: { idPhoto1: result.idPhoto1, idPhoto2: result.idPhoto2 },
  });

  return result;
}

export async function saveReturn(
  bookingId: number,
  action: string,
  data: { incomplete_notes?: string; security_held?: number; incomplete_photo?: string },
  by?: string,
) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { bookingItems: true },
  });
  if (!booking) throw new Error("Booking not found");

  if (action === "mark_returned") {
    await clearBookingIdPhotos(booking);
    await prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: "returned",
          returnedAt: new Date(),
          idPhoto1: null,
          idPhoto2: null,
        },
      });
      for (const bi of booking.bookingItems) {
        if (bi.isDelivered) {
          await tx.bookingItem.update({ where: { id: bi.id }, data: { isReturned: true } });
        }
        await tx.clothingItem.update({ where: { id: bi.itemId }, data: { status: "available" } });
      }
    });
  } else if (action === "incomplete_return") {
    await clearBookingIdPhotos(booking);
    await prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: "incomplete_return",
          incompleteNotes: data.incomplete_notes || "",
          incompletePhoto: data.incomplete_photo || null,
          securityHeld: data.security_held || 0,
          returnedAt: new Date(),
          idPhoto1: null,
          idPhoto2: null,
        },
      });
      for (const bi of booking.bookingItems) {
        if (bi.isDelivered) {
          await tx.bookingItem.update({ where: { id: bi.id }, data: { isReturned: true } });
        }
        await tx.clothingItem.update({ where: { id: bi.itemId }, data: { status: "available" } });
      }
    });
  }
  const updated = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (updated) {
    broadcastShopEvent({ type: "booking.returned", bookingId, status: updated.status, by });
    logActivity({
      username: by || "system",
      action: "returned",
      entity: "booking",
      entityId: bookingId,
      label: `Return (${action}) — Booking #${String(booking.monthlySerial).padStart(2, "0")} — ${booking.customerName}`,
      before: snapshotBooking(booking as unknown as Record<string, unknown>),
      after: snapshotBooking(updated as unknown as Record<string, unknown>),
    });
  }
  return updated;
}

export async function resolveIncompleteReturn(bookingId: number) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.status !== "incomplete_return") return null;
  return prisma.booking.update({ where: { id: bookingId }, data: { status: "returned" } });
}

function alternateBookingSide(
  b: {
    id: number;
    monthlySerial: number;
    customerName: string;
    contact1: string | null;
    whatsappNo: string | null;
    customerAddress: string | null;
    deliveryTime: string;
    deliveryDate: Date;
    returnTime: string;
    returnDate: Date;
    venue: string | null;
    totalPrice: number;
    price: number;
    totalRemaining: number;
    remaining: number;
    remainingCollected: number;
    securityDeposit: number;
    securityCollected: number;
    dressName?: string | null;
    notes?: string | null;
    commonNotes?: string | null;
    bookingItems?: Array<{
      dressName: string;
      category?: string | null;
      size?: string | null;
      notes?: string | null;
      item?: { size?: string | null } | null;
    }>;
    legacyItem?: { category?: string | null; size?: string | null } | null;
  },
  items: string[]
) {
  const std = serializeStandardBookingDetails(b);
  const totalRemaining = b.totalRemaining ?? b.remaining ?? 0;
  const remainingCollected = b.remainingCollected || 0;
  return {
    id: b.id,
    serial: b.monthlySerial,
    customer_name: b.customerName,
    contact_1: b.contact1 || "",
    whatsapp_no: b.whatsappNo || "",
    address: b.customerAddress || "",
    delivery_time: b.deliveryTime,
    delivery_date: formatDate(b.deliveryDate, "iso"),
    return_time: b.returnTime,
    return_date: formatDate(b.returnDate, "iso"),
    venue: b.venue || "",
    total_price: b.totalPrice || b.price || 0,
    total_rent: b.totalPrice || b.price || 0,
    total_remaining: totalRemaining,
    remaining_collected: remainingCollected,
    balance_remaining: Math.max(0, totalRemaining - remainingCollected),
    security_deposit: b.securityDeposit || 0,
    security_collected: b.securityCollected || 0,
    item_notes: std.item_notes,
    common_notes: std.common_notes,
    items,
  };
}

export async function getReturningToday(targetDateStr: string) {
  const refDate = parseDateQ(targetDateStr || new Date().toISOString().slice(0, 10));
  const returning = await prisma.booking.findMany({
    where: {
      returnDate: refDate,
      status: { in: ["booked", "delivered"] },
    },
    include: { bookingItems: { include: { item: true } }, legacyItem: true },
    orderBy: { returnTime: "asc" },
  });

  const candidates = await prisma.booking.findMany({
    where: {
      deliveryDate: refDate,
      status: { in: ["booked", "delivered"] },
    },
    include: { bookingItems: { include: { item: true } }, legacyItem: true },
  });

  const data = [];
  for (const b of returning) {
    const itemRows = serializeBookingItems(b);
    const itemIds = b.bookingItems.length
      ? b.bookingItems.map((bi) => bi.itemId)
      : b.itemId
        ? [b.itemId]
        : [];
    const retIdSet = new Set(itemIds);

    let next_booking: ReturnType<typeof alternateBookingSide> | null = null;

    for (const nxt of candidates) {
      if (nxt.id === b.id) continue;
      const nxtIds = nxt.bookingItems.length
        ? nxt.bookingItems.map((bi) => bi.itemId)
        : nxt.itemId
          ? [nxt.itemId]
          : [];
      const matchedIds = nxtIds.filter((id) => retIdSet.has(id));
      if (!matchedIds.length) continue;

      const matchedNames = nxt.bookingItems.length
        ? nxt.bookingItems
            .filter((bi) => matchedIds.includes(bi.itemId))
            .map((bi) => dressDisplayName(bi.dressName, bi.category, bookingItemSize(bi)))
        : itemRows.map((i) => i.display_name || i.name);

      next_booking = alternateBookingSide(nxt, matchedNames);
      break;
    }

    if (!next_booking) {
      // Still show returning record even without alternate delivery
    }

    const returningSide = alternateBookingSide(b, itemRows.map((i) => i.display_name || i.name));
    data.push({
      ...returningSide,
      delivery_notes: b.deliveryNotes || "",
      item_categories: itemRows.map((i) => i.category).filter(Boolean),
      dress_names: itemRows.map((i) => i.display_name || i.name).join(", "),
      next_booking,
    });
  }
  return data;
}

export async function cancelBooking(bookingId: number, refundAmount = 0, by?: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { bookingItems: true },
  });
  if (!booking) throw new Error("Booking not found");
  await prisma.$transaction(async (tx) => {
    await tx.booking.update({
      where: { id: bookingId },
      data: {
        status: "cancelled",
        refundAmount: refundAmount > 0 ? refundAmount : 0,
        refundedAt: refundAmount > 0 ? new Date() : null,
      },
    });
    for (const bi of booking.bookingItems) {
      const stillUsed = await tx.booking.findFirst({
        where: {
          id: { not: bookingId },
          status: { in: ["booked", "delivered"] },
          OR: [{ itemId: bi.itemId }, { bookingItems: { some: { itemId: bi.itemId } } }],
        },
      });
      if (!stillUsed) {
        await tx.clothingItem.update({ where: { id: bi.itemId }, data: { status: "available" } });
      }
    }
  });
  broadcastShopEvent({ type: "booking.cancelled", bookingId, status: "cancelled", by });
  logActivity({
    username: by || "system",
    action: "cancelled",
    entity: "booking",
    entityId: bookingId,
    label: `Cancelled — Booking #${String(booking.monthlySerial).padStart(2, "0")} — ${booking.customerName} (Refund: ₹${refundAmount})`,
    before: snapshotBooking(booking as unknown as Record<string, unknown>),
    after: { status: "cancelled", refundAmount },
  });
}

export async function getRecycleBin() {
  return prisma.booking.findMany({
    where: { status: "cancelled" },
    include: { bookingItems: { include: { item: true } }, legacyItem: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function restoreBooking(bookingId: number) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { bookingItems: true },
  });
  if (!booking || booking.status !== "cancelled") throw new Error("Cannot restore");
  await prisma.$transaction(async (tx) => {
    await tx.booking.update({ where: { id: bookingId }, data: { status: "booked" } });
    for (const bi of booking.bookingItems) {
      await tx.clothingItem.update({ where: { id: bi.itemId }, data: { status: "rented" } });
    }
  });
}

export async function deleteBookingPermanent(bookingId: number) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.status !== "cancelled") throw new Error("Only cancelled bookings can be deleted");
  await prisma.booking.delete({ where: { id: bookingId } });
}

export async function getDeliveryDetail(bookingId: number) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { bookingItems: { include: { item: true } } },
  });
  if (!booking) return null;
  const next_bookings = [];
  for (const bi of booking.bookingItems) {
    const nxt = await prisma.booking.findFirst({
      where: {
        id: { not: booking.id },
        deliveryDate: booking.returnDate,
        status: { not: "cancelled" },
        bookingItems: { some: { itemId: bi.itemId } },
      },
    });
    if (nxt) {
      next_bookings.push({
        dress: dressDisplayName(bi.dressName, bi.category, bookingItemSize(bi)),
        next_customer: nxt.customerName,
        next_serial: nxt.monthlySerial,
        next_time: nxt.deliveryTime,
        next_venue: nxt.venue || "",
      });
    }
  }
  return { booking, next_bookings };
}

export { getAvailableItemsApi };
