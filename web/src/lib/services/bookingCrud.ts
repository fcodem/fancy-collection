import prisma, { parseDateQ } from "../prisma";
import { Prisma } from "@prisma/client";
import {
  findFirstItemConflict,
  findItemIdsStillInActiveBookings,
  formatItemConflictError,
  createBookingNumber,
} from "../booking";
import { allocateMonthlySerial, previewNextMonthlySerial } from "../bookingSerialCounter";
import { lockInventoryItemsForBooking } from "../bookingItemLocks";
import { parseDate, assertBookingDatesNotPast } from "../constants";
import { shouldSkipCustomerCreate } from "./customersOps";
import { broadcastShopEvent } from "../realtime/broadcast";
import { logActivity, snapshotBooking } from "../activityLog";
import { formatPublicBookingId } from "./whatsapp/publicBookingId";
import { newPublicAccessToken } from "@/lib/publicRateLimit";
import { generateBookingQrToken } from "../bookingQr";
import { trackBookingPrivateMedia } from "../bookingPrivateMediaTracking";
import { BOOKING_PRIVATE_MEDIA_TYPES } from "../bookingPrivateMediaTypes";

export type BookingItemInput = {
  item_id: number;
  dress_name: string;
  price: number;
  advance: number;
  notes?: string;
};

export type BookingOrderInput = {
  id?: number;
  description: string;
  cost: number;
  advance: number;
  advance_payment_mode?: "cash" | "online";
  photo?: string;
  delivery_date: string;
  delivery_time: string;
};

export type BookingFormInput = {
  customer_name: string;
  customer_address: string;
  contact_1: string;
  whatsapp_no: string;
  delivery_date: string;
  delivery_time: string;
  return_date: string;
  return_time: string;
  venue?: string;
  security_deposit?: number;
  common_notes?: string;
  staff_names?: string[];
  payment_mode?: "cash" | "online";
  items: BookingItemInput[];
  orders?: BookingOrderInput[];
  /** Opaque client UUID — stored uniquely so duplicate submits reuse one booking. */
  client_request_id?: string;
};

type ItemToBook = {
  item: NonNullable<Awaited<ReturnType<typeof prisma.clothingItem.findUnique>>>;
  row: BookingItemInput;
};

function assertUniqueItemIds(itemIds: number[]) {
  if (new Set(itemIds).size !== itemIds.length) {
    throw new Error("Each dress can only be selected once per booking.");
  }
}

function throwIfConflict(
  conflict: Awaited<ReturnType<typeof findFirstItemConflict>>,
  items: BookingItemInput[],
) {
  if (!conflict) return;
  const row = items.find((r) => r.item_id === conflict.itemId);
  throw new Error(
    formatItemConflictError(row?.dress_name || "Dress", conflict.booking.monthlySerial),
  );
}

export async function createBooking(
  input: BookingFormInput,
  by?: string,
  opts?: {
    /** Insert booking-bill job in the same transaction (required for atomic outbox). */
    scheduleBillInTx?: (
      tx: Prisma.TransactionClient,
      bookingId: number,
    ) => Promise<unknown>;
  },
) {
  assertBookingDatesNotPast(input.delivery_date, input.return_date);
  const deliveryDate = parseDate(input.delivery_date);
  const returnDate = parseDate(input.return_date);
  if (returnDate < deliveryDate) throw new Error("Return date must be on or after delivery date.");
  const deliveryDateQ = parseDateQ(input.delivery_date);
  const returnDateQ = parseDateQ(input.return_date);
  if (!input.items.length) throw new Error("Please select at least one dress.");

  const itemIds = input.items.map((row) => row.item_id);
  assertUniqueItemIds(itemIds);

  const [bookingNumber, skipCustomer, items] = await Promise.all([
    createBookingNumber(),
    shouldSkipCustomerCreate(input.contact_1, input.whatsapp_no),
    prisma.clothingItem.findMany({ where: { id: { in: itemIds } } }),
  ]);
  const itemMap = new Map(items.map((item) => [item.id, item]));

  const itemsToBook: ItemToBook[] = [];
  for (const row of input.items) {
    const item = itemMap.get(row.item_id);
    if (!item) throw new Error(`Dress '${row.dress_name}' not found.`);
    itemsToBook.push({ item, row });
  }

  const booking = await prisma.$transaction(async (tx) => {
    await lockInventoryItemsForBooking(tx, itemIds);
    throwIfConflict(
      await findFirstItemConflict(itemIds, input.delivery_date, input.return_date, undefined, tx),
      input.items,
    );

    const monthlySerial = await allocateMonthlySerial(tx, deliveryDate);
    const totalPrice = input.items.reduce((s, i) => s + i.price, 0);
    const totalAdvance = input.items.reduce((s, i) => s + i.advance, 0);
    const totalRemaining = totalPrice - totalAdvance;
    const staffNames = (input.staff_names || []).filter(Boolean).join(", ");

    const b = await tx.booking.create({
      data: {
        bookingNumber,
        monthlySerial,
        customerName: input.customer_name.trim(),
        customerAddress: input.customer_address.trim(),
        contact1: input.contact_1.trim(),
        whatsappNo: input.whatsapp_no.trim(),
        venue: input.venue?.trim() || null,
        staffNames: staffNames || null,
        deliveryDate: deliveryDateQ,
        deliveryTime: input.delivery_time,
        returnDate: returnDateQ,
        returnTime: input.return_time,
        securityDeposit: input.security_deposit || 0,
        totalPrice,
        totalAdvance,
        totalRemaining,
        advancePaymentMode: input.payment_mode === "online" ? "online" : "cash",
        commonNotes: input.common_notes?.trim() || null,
        itemId: itemsToBook[0].item.id,
        dressName: itemsToBook[0].row.dress_name,
        price: totalPrice,
        advance: totalAdvance,
        remaining: totalRemaining,
        ...(input.client_request_id?.trim()
          ? { clientRequestId: input.client_request_id.trim() }
          : {}),
      },
    });

    await tx.bookingItem.createMany({
      data: itemsToBook.map(({ item, row }) => ({
        bookingId: b.id,
        itemId: item.id,
        dressName: row.dress_name,
        category: item.category,
        size: item.size || "",
        price: row.price,
        advance: row.advance,
        remaining: row.price - row.advance,
        notes: row.notes || null,
      })),
    });
    await tx.clothingItem.updateMany({
      where: { id: { in: itemIds } },
      data: { status: "rented" },
    });

    const orderRows = (input.orders || []).filter((o) => o.description.trim());
    if (orderRows.length) {
      await tx.bookingOrder.createMany({
        data: orderRows.map((o) => ({
          bookingId: b.id,
          description: o.description.trim(),
          cost: o.cost || 0,
          advance: o.advance || 0,
          advancePaymentMode: o.advance_payment_mode || input.payment_mode || "cash",
          balance: Math.max(0, (o.cost || 0) - (o.advance || 0)),
          photo: o.photo || null,
          deliveryDate: parseDateQ(o.delivery_date),
          deliveryTime: o.delivery_time,
        })),
      });
    }

    if (!skipCustomer) {
      await tx.customer.create({
        data: {
          name: input.customer_name.trim(),
          phone: input.contact_1.trim(),
          address: input.customer_address.trim(),
        },
      });
    }

    const publicBookingId = formatPublicBookingId(b.id);
    const qrToken = generateBookingQrToken();
    const publicAccessToken = newPublicAccessToken();
    const publicAccessExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    const updated = await tx.booking.update({
      where: { id: b.id },
      data: { publicBookingId, qrToken, publicAccessToken, publicAccessExpiresAt },
    });

    // Atomic outbox: bill job commits with the booking or the booking rolls back.
    if (opts?.scheduleBillInTx) {
      await opts.scheduleBillInTx(tx, updated.id);
    }

    return updated;
  });

  broadcastShopEvent({ type: "booking.created", bookingId: booking.id, status: booking.status, by });

  void prisma.bookingOrder
    .findMany({ where: { bookingId: booking.id }, select: { id: true, photo: true } })
    .then(async (orders) => {
      for (const order of orders) {
        if (!order.photo) continue;
        await trackBookingPrivateMedia({
          bookingId: booking.id,
          blobUrl: order.photo,
          bookingOrderId: order.id,
          mediaType: BOOKING_PRIVATE_MEDIA_TYPES.ORDER_PHOTO,
        });
      }
    })
    .catch(() => {});

  void prisma.booking
    .findUnique({ where: { id: booking.id }, include: { bookingItems: true } })
    .then((full) => {
      logActivity({
        username: by || "system",
        action: "created",
        entity: "booking",
        entityId: booking.id,
        label: `Booking #${String(booking.monthlySerial).padStart(2, "0")} — ${input.customer_name} (${input.items.map((i) => i.dress_name).join(", ")})`,
        after: full ? snapshotBooking(full as unknown as Record<string, unknown>) : undefined,
      });
    })
    .catch(() => {});

  return booking;
}

export async function updateBooking(bookingId: number, input: BookingFormInput, by?: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { bookingItems: true, orders: true },
  });
  if (!booking) throw new Error("Booking not found.");
  const beforeSnapshot = snapshotBooking(booking as unknown as Record<string, unknown>);

  assertBookingDatesNotPast(input.delivery_date, input.return_date);
  const deliveryDate = parseDate(input.delivery_date);
  const returnDate = parseDate(input.return_date);
  if (returnDate < deliveryDate) throw new Error("Return date must be on or after delivery date.");
  const deliveryDateQ = parseDateQ(input.delivery_date);
  const returnDateQ = parseDateQ(input.return_date);
  if (!input.items.length) throw new Error("Please select at least one dress.");

  const oldItemIds = new Set([
    ...booking.bookingItems.map((bi) => bi.itemId).filter((id): id is number => id != null),
    ...(booking.itemId ? [booking.itemId] : []),
  ]);

  const itemIds = input.items.map((row) => row.item_id);
  assertUniqueItemIds(itemIds);
  const items = await prisma.clothingItem.findMany({ where: { id: { in: itemIds } } });
  const itemMap = new Map(items.map((item) => [item.id, item]));

  const itemsToBook: ItemToBook[] = [];
  const newItemIds = new Set<number>();
  for (const row of input.items) {
    const item = itemMap.get(row.item_id);
    if (!item) throw new Error(`Dress '${row.dress_name}' not found.`);
    itemsToBook.push({ item, row });
    newItemIds.add(item.id);
  }

  const totalPrice = input.items.reduce((s, i) => s + i.price, 0);
  const totalAdvance = input.items.reduce((s, i) => s + i.advance, 0);
  const totalRemaining = totalPrice - totalAdvance;
  const staffNames = (input.staff_names || []).filter(Boolean).join(", ");

  await prisma.$transaction(async (tx) => {
    await lockInventoryItemsForBooking(tx, itemIds);
    throwIfConflict(
      await findFirstItemConflict(itemIds, input.delivery_date, input.return_date, bookingId, tx),
      input.items,
    );

    await tx.booking.update({
      where: { id: bookingId },
      data: {
        customerName: input.customer_name.trim(),
        customerAddress: input.customer_address.trim(),
        contact1: input.contact_1.trim(),
        whatsappNo: input.whatsapp_no.trim(),
        venue: input.venue?.trim() || null,
        staffNames: staffNames || null,
        deliveryDate: deliveryDateQ,
        deliveryTime: input.delivery_time,
        returnDate: returnDateQ,
        returnTime: input.return_time,
        securityDeposit: input.security_deposit || 0,
        commonNotes: input.common_notes?.trim() || null,
        totalPrice,
        totalAdvance,
        totalRemaining,
        itemId: itemsToBook[0].item.id,
        dressName: itemsToBook[0].row.dress_name,
        price: totalPrice,
        advance: totalAdvance,
        remaining: totalRemaining,
      },
    });

    await tx.bookingItem.deleteMany({ where: { bookingId } });

    for (const { item, row } of itemsToBook) {
      await tx.bookingItem.create({
        data: {
          bookingId,
          itemId: item.id,
          dressName: row.dress_name,
          category: item.category,
          size: item.size || "",
          price: row.price,
          advance: row.advance,
          remaining: row.price - row.advance,
          notes: row.notes || null,
        },
      });
      await tx.clothingItem.update({ where: { id: item.id }, data: { status: "rented" } });
    }

    const freedIds = [...oldItemIds].filter((id) => !newItemIds.has(id));
    if (freedIds.length) {
      const stillUsed = await findItemIdsStillInActiveBookings(freedIds, bookingId, tx);
      for (const freedId of freedIds) {
        if (!stillUsed.has(freedId)) {
          await tx.clothingItem.update({ where: { id: freedId }, data: { status: "available" } });
        }
      }
    }

    const formOrders = (input.orders || []).filter((o) => o.description.trim());
    const keptOrderIds = new Set<number>();
    for (const o of formOrders) {
      const cost = o.cost || 0;
      const advance = o.advance || 0;
      const balance = Math.max(0, cost - advance);
      if (o.id) {
        const existing = booking.orders.find((eo) => eo.id === o.id);
        if (existing && existing.status === "active") {
          keptOrderIds.add(o.id);
          await tx.bookingOrder.update({
            where: { id: o.id },
            data: {
              description: o.description.trim(),
              cost,
              advance,
              advancePaymentMode: o.advance_payment_mode || existing.advancePaymentMode || input.payment_mode || "cash",
              balance,
              photo: o.photo || existing.photo || null,
              deliveryDate: parseDateQ(o.delivery_date),
              deliveryTime: o.delivery_time,
            },
          });
          continue;
        }
      }
      await tx.bookingOrder.create({
        data: {
          bookingId,
          description: o.description.trim(),
          cost,
          advance,
          advancePaymentMode: o.advance_payment_mode || input.payment_mode || "cash",
          balance,
          photo: o.photo || null,
          deliveryDate: parseDateQ(o.delivery_date),
          deliveryTime: o.delivery_time,
        },
      });
    }

    // Orders removed from the form are canceled (never hard-deleted) so finance
    // history and any collected money remain traceable via a refund entry.
    for (const existing of booking.orders) {
      if (existing.status !== "active") continue;
      if (keptOrderIds.has(existing.id)) continue;
      await tx.bookingOrder.update({
        where: { id: existing.id },
        data: {
          status: "cancelled",
          cancelledAt: new Date(),
          refundAmount: existing.advance + existing.balanceCollected,
        },
      });
    }
  });

  const updated = await prisma.booking.findUnique({ where: { id: bookingId }, include: { bookingItems: true } });
  if (updated) {
    const beforeDresses = booking.bookingItems.map((bi) => bi.dressName).filter(Boolean);
    const afterDresses = input.items.map((i) => i.dress_name).filter(Boolean);
    const dressList = afterDresses.join(", ");
    let label = `Booking #${String(updated.monthlySerial).padStart(2, "0")} — ${updated.customerName}`;
    if (dressList) label += ` (${dressList})`;
    if (beforeDresses.join("|") !== afterDresses.join("|")) {
      label += ` · Dress change: ${beforeDresses.join(", ") || "—"} → ${afterDresses.join(", ") || "—"}`;
    }
    broadcastShopEvent({ type: "booking.updated", bookingId, status: updated.status, by });
    logActivity({
      username: by || "system",
      action: "updated",
      entity: "booking",
      entityId: bookingId,
      label,
      before: beforeSnapshot,
      after: snapshotBooking(updated as unknown as Record<string, unknown>),
    });
  }
  return updated;
}

export async function getNextSerialForDate(deliveryDateStr: string) {
  const serial = await previewNextMonthlySerial(deliveryDateStr);
  return { serial, display: String(serial).padStart(2, "0") };
}
