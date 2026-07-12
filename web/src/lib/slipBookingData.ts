import { formatDate, formatBookingDateTime } from "@/lib/constants";
import {
  BRAND_ADDRESS_DEFAULT,
  BRAND_FULL_NAME,
  BRAND_MOTTO,
  BRAND_PHONES_DISPLAY,
} from "@/lib/branding";
import { resolvePublicBookingId } from "@/lib/services/whatsapp/publicBookingId";
import { inventoryPhotoRef } from "@/lib/catalogPhotoRef";
import { photoUrl } from "@/lib/photoUrl";
import {
  formatSlipDateTime,
  isLateReturn,
  itemReturnCondition,
} from "@/lib/slipConstants";
import { incompleteReturnSecuritySummary } from "@/lib/bookingDetails";
import type { ReturnSlipResolve } from "@/lib/bookingStatus";
import type { ReturnSlipProps } from "@/components/ReturnSlip";
import type { DeliverySlipProps } from "@/components/DeliverySlip";
import type { BookingSlipProps } from "@/components/BookingSlip";

type BookingWithItems = {
  id: number;
  publicBookingId: string | null;
  monthlySerial: number;
  customerName: string;
  customerAddress: string;
  contact1: string;
  whatsappNo: string | null;
  deliveryDate: Date;
  deliveryTime: string;
  returnDate: Date;
  returnTime: string;
  venue: string | null;
  staffNames: string | null;
  securityDeposit: number;
  totalPrice: number;
  totalAdvance: number;
  totalRemaining: number;
  remainingCollected: number;
  securityCollected: number;
  remainingPaymentMode?: string | null;
  securityPaymentMode?: string | null;
  commonNotes: string | null;
  deliveryNotes: string | null;
  incompleteNotes: string | null;
  incompletePhoto: string | null;
  status: string;
  createdAt: Date;
  deliveredAt: Date | null;
  returnedAt: Date | null;
  securityHeld: number;
  refundAmount: number;
  dressName?: string | null;
  bookingItems: Array<{
    id?: number;
    dressName: string;
    category: string | null;
    size: string | null;
    price: number;
    advance: number;
    remaining: number;
    notes: string | null;
    isDelivered?: boolean;
    isCancelled?: boolean;
    cancelRefundAmount?: number;
    isIncompleteReturn: boolean;
    isReturned: boolean;
    itemIncompleteNotes: string | null;
    itemIncompletePhoto: string | null;
    itemSecurityHeld: number;
    itemRemainingCollected?: number;
    itemSecurityCollected?: number;
    itemDeliveryNotes?: string | null;
    deliveredAt?: Date | null;
    item: {
      color: string | null;
      photo?: string | null;
      originalPhoto?: string | null;
      enhancedPhoto?: string | null;
    } | null;
  }>;
  orders?: Array<{
    id: number;
    description: string;
    cost: number;
    advance: number;
    balance: number;
    photo: string | null;
    deliveryDate: Date;
    deliveryTime: string;
    status: string;
  }>;
};

export type SlipOrder = {
  description: string;
  cost: number;
  advance: number;
  balance: number;
  photo: string | null;
  deliveryDate: string;
  deliveryTime: string;
  includedInRent: boolean;
};

function mapOrder(o: NonNullable<BookingWithItems["orders"]>[number]): SlipOrder {
  return {
    description: o.description,
    cost: o.cost,
    advance: o.advance,
    balance: Math.max(0, o.balance),
    photo: o.photo,
    deliveryDate: formatDate(o.deliveryDate, "display"),
    deliveryTime: o.deliveryTime,
    includedInRent: (o.cost || 0) === 0,
  };
}

function activeSlipOrders(booking: BookingWithItems): SlipOrder[] {
  return (booking.orders ?? [])
    .filter((o) => o.status === "active")
    .map(mapOrder);
}

/** Serialize raw BookingOrder rows (active only) into display orders for records/panels. */
export function serializeActiveOrders(
  orders: NonNullable<BookingWithItems["orders"]> | null | undefined,
): SlipOrder[] {
  return (orders ?? []).filter((o) => o.status === "active").map(mapOrder);
}

export type BuildDeliverySlipOptions = {
  bookingItemId?: number;
  bookingItemIds?: number[];
  scope?: "full" | "single" | "combined";
};

function mapSlipItem(bi: BookingWithItems["bookingItems"][number]) {
  return {
    dressName: bi.dressName,
    category: bi.category || "",
    size: bi.size || "",
    color: bi.item?.color ?? null,
    price: bi.price,
    advance: bi.advance,
    remaining: bi.remaining,
    notes: bi.notes,
    isCancelled: Boolean(bi.isCancelled),
    cancelRefunded: Boolean(bi.isCancelled && (bi.cancelRefundAmount || 0) > 0),
    isPendingPickup: Boolean(!bi.isDelivered && !bi.isCancelled),
  };
}

export function buildDeliverySlipData(
  booking: BookingWithItems,
  opts?: BuildDeliverySlipOptions,
): {
  booking: DeliverySlipProps["booking"];
  items: DeliverySlipProps["items"];
  orders: SlipOrder[];
  slipSubtitle?: string;
} {
  const publicId = resolvePublicBookingId(booking);
  const allItems = booking.bookingItems ?? [];
  const activeItems = allItems.filter((bi) => !bi.isCancelled);
  const cancelledItems = allItems.filter((bi) => bi.isCancelled);
  const deliveredItems = activeItems.filter((bi) => bi.isDelivered);
  const pendingPickupItems = activeItems.filter((bi) => !bi.isDelivered);

  const deltaItems =
    opts?.bookingItemIds?.length
      ? deliveredItems.filter((bi) => bi.id != null && opts.bookingItemIds!.includes(bi.id))
      : opts?.bookingItemId
        ? deliveredItems.filter((bi) => bi.id === opts.bookingItemId)
        : null;

  const allDelivered =
    activeItems.length > 0 && deliveredItems.length === activeItems.length;
  const useFullSlip =
    opts?.scope === "full" ||
    (!opts?.scope &&
      !deltaItems &&
      (booking.status === "returned" ||
        booking.status === "incomplete_return" ||
        allDelivered ||
        booking.status === "delivered"));

  let sourceItems: BookingWithItems["bookingItems"];
  let slipSubtitle: string | undefined;
  let totalPrice: number;
  let totalAdvance: number;
  let totalRemaining: number;
  let remainingCollected: number;
  let securityCollected: number;
  let securityDeposit: number;
  let deliveryNotes: string | null | undefined;
  let deliveredAt: Date;

  if (useFullSlip) {
    sourceItems =
      allItems.length > 0
        ? [...deliveredItems, ...pendingPickupItems, ...cancelledItems]
        : booking.dressName
          ? []
          : [];
    totalPrice = booking.totalPrice;
    totalAdvance = booking.totalAdvance;
    totalRemaining = booking.totalRemaining;
    remainingCollected = booking.remainingCollected;
    securityCollected = booking.securityCollected;
    securityDeposit = booking.securityDeposit;
    deliveryNotes = booking.deliveryNotes;
    deliveredAt =
      booking.deliveredAt ??
      deliveredItems.find((bi) => bi.deliveredAt)?.deliveredAt ??
      booking.createdAt;
  } else {
    if (deltaItems?.length) {
      sourceItems = deltaItems;
    } else {
      const itemId = opts?.bookingItemId;
      if (itemId) {
        const bi = deliveredItems.find((b) => b.id === itemId);
        if (!bi) throw new Error("Delivered booking item not found");
        sourceItems = [bi];
      } else if (deliveredItems.length === 1) {
        sourceItems = deliveredItems;
      } else if (deliveredItems.length > 1) {
        sourceItems = deliveredItems;
      } else {
        throw new Error("No delivered items for delivery slip");
      }
    }

    totalPrice = sourceItems.reduce((s, i) => s + i.price, 0);
    totalAdvance = sourceItems.reduce((s, i) => s + i.advance, 0);
    totalRemaining = sourceItems.reduce((s, i) => s + i.remaining, 0);
    remainingCollected = sourceItems.reduce(
      (s, i) => s + (i.itemRemainingCollected ?? 0),
      0,
    );
    securityCollected = sourceItems.reduce(
      (s, i) => s + (i.itemSecurityCollected ?? 0),
      0,
    );
    securityDeposit = securityCollected;
    deliveryNotes =
      sourceItems.length === 1
        ? sourceItems[0].itemDeliveryNotes || booking.deliveryNotes
        : sourceItems
            .map((bi) =>
              bi.itemDeliveryNotes ? `${bi.dressName}: ${bi.itemDeliveryNotes}` : null,
            )
            .filter(Boolean)
            .join(" | ") || booking.deliveryNotes;
    deliveredAt = sourceItems.reduce((latest, bi) => {
      const d = bi.deliveredAt ?? booking.createdAt;
      return d > latest ? d : latest;
    }, sourceItems[0].deliveredAt ?? booking.createdAt);

    const dressLabel = sourceItems.length === 1 ? sourceItems[0].dressName : "";
    slipSubtitle = `Partial delivery — ${sourceItems.length} dress(es) on this slip${
      dressLabel ? ` (${dressLabel})` : ""
    }`;
  }

  // Always surface pending-pickup + cancelled dresses on the slip (not in money totals for partial).
  const displayItems = [
    ...sourceItems,
    ...pendingPickupItems.filter((p) => !sourceItems.some((s) => s.id != null && s.id === p.id)),
    ...cancelledItems.filter((c) => !sourceItems.some((s) => s.id != null && s.id === c.id)),
  ];

  const items =
    displayItems.length > 0
      ? displayItems.map(mapSlipItem)
      : booking.dressName
        ? [
            {
              dressName: booking.dressName,
              category: "",
              size: "",
              color: null,
              price: booking.totalPrice,
              advance: booking.totalAdvance,
              remaining: booking.totalRemaining,
              notes: null,
            },
          ]
        : [];

  return {
    slipSubtitle,
    booking: {
      publicBookingId: publicId,
      monthlySerial: booking.monthlySerial,
      customerName: booking.customerName,
      customerAddress: booking.customerAddress,
      contact1: booking.contact1,
      whatsappNo: booking.whatsappNo,
      deliveryDate: formatDate(booking.deliveryDate, "display"),
      deliveryTime: booking.deliveryTime,
      returnDate: formatDate(booking.returnDate, "display"),
      returnTime: booking.returnTime,
      venue: booking.venue,
      staffNames: booking.staffNames,
      securityDeposit,
      totalPrice,
      totalAdvance,
      totalRemaining,
      remainingCollected,
      securityCollected,
      deliveryNotes,
      remainingPaymentMode: booking.remainingPaymentMode ?? null,
      securityPaymentMode: booking.securityPaymentMode ?? null,
      deliveredAt: deliveredAt.toISOString(),
      status: booking.status,
      createdAt: booking.createdAt.toISOString(),
    },
    items,
    orders: activeSlipOrders(booking),
  };
}

export type BuildReturnSlipOptions = {
  scope?: ReturnSlipResolve["scope"];
  bookingItemId?: number;
  bookingItemIds?: number[];
};

function mapReturnSlipItem(bi: BookingWithItems["bookingItems"][number]) {
  return {
    dressName: bi.dressName,
    category: bi.category || "",
    size: bi.size || "",
    color: bi.item?.color ?? null,
    price: bi.price,
    advance: bi.advance,
    remaining: bi.remaining,
    returnCondition: bi.isCancelled ? "cancelled" : (itemReturnCondition(bi) as string),
    notes: bi.notes,
    isCancelled: Boolean(bi.isCancelled),
    cancelRefunded: Boolean(bi.isCancelled && (bi.cancelRefundAmount || 0) > 0),
  };
}

export function buildReturnSlipData(
  booking: BookingWithItems,
  opts?: BuildReturnSlipOptions,
): {
  booking: ReturnSlipProps["booking"];
  items: ReturnSlipProps["items"];
  orders: SlipOrder[];
  slipSubtitle?: string;
} {
  const publicId = resolvePublicBookingId(booking);
  const allItems = booking.bookingItems ?? [];
  const activeItems = allItems.filter((bi) => !bi.isCancelled);
  const cancelledItems = allItems.filter((bi) => bi.isCancelled);
  const deliveredItems = activeItems.filter((bi) => bi.isDelivered);
  const returnedItems = activeItems.filter((bi) => bi.isReturned && !bi.isIncompleteReturn);

  const deltaItems =
    opts?.bookingItemIds?.length
      ? returnedItems.filter((bi) => bi.id != null && opts.bookingItemIds!.includes(bi.id))
      : opts?.bookingItemId
        ? returnedItems.filter((bi) => bi.id === opts.bookingItemId)
        : null;

  const allReturned =
    deliveredItems.length > 0 &&
    returnedItems.length === deliveredItems.length &&
    activeItems.every((bi) => bi.isDelivered);
  const useFullSlip =
    opts?.scope === "full" ||
    (!opts?.scope &&
      !deltaItems &&
      (booking.status === "returned" ||
        booking.status === "incomplete_return" ||
        allReturned));

  let sourceItems: BookingWithItems["bookingItems"];
  let slipSubtitle: string | undefined;
  let totalPrice: number;
  let totalAdvance: number;
  let totalRemaining: number;
  let remainingPaid: number;
  let securityDeposit: number;
  let securityRefunded: number;
  let damageCharge: number;
  let finalSettlement: number;
  let returnedAt = booking.returnedAt;

  if (useFullSlip) {
    sourceItems = allItems;
    const actual = formatSlipDateTime(booking.returnedAt);
    const late = isLateReturn(booking.returnedAt, booking.returnDate);
    damageCharge =
      booking.status === "incomplete_return" ? Math.max(0, booking.securityHeld) : 0;
    securityRefunded =
      booking.status === "returned"
        ? Math.max(0, booking.refundAmount || booking.securityCollected - booking.securityHeld)
        : 0;
    remainingPaid = booking.remainingCollected;
    const balanceDue = Math.max(0, booking.totalRemaining - remainingPaid);
    finalSettlement = 0;
    if (booking.refundAmount > 0) finalSettlement = -booking.refundAmount;
    else if (balanceDue > 0) finalSettlement = balanceDue;
    else if (securityRefunded > 0) finalSettlement = -securityRefunded;

    totalPrice = booking.totalPrice;
    totalAdvance = booking.totalAdvance;
    totalRemaining = booking.totalRemaining;
    securityDeposit = booking.securityDeposit;

    const items = sourceItems.length > 0
      ? sourceItems.map(mapReturnSlipItem)
      : booking.dressName
        ? [{
            dressName: booking.dressName,
            category: "",
            size: "",
            color: null,
            price: booking.totalPrice,
            advance: booking.totalAdvance,
            remaining: booking.totalRemaining,
            returnCondition: "good" as const,
            notes: null,
          }]
        : [];

    return {
      slipSubtitle,
      booking: {
        publicBookingId: publicId,
        monthlySerial: booking.monthlySerial,
        customerName: booking.customerName,
        customerAddress: booking.customerAddress,
        contact1: booking.contact1,
        whatsappNo: booking.whatsappNo,
        deliveryDate: formatDate(booking.deliveryDate, "display"),
        deliveryTime: booking.deliveryTime,
        returnDate: formatDate(booking.returnDate, "display"),
        returnTime: booking.returnTime,
        actualReturnDate: actual.date,
        actualReturnTime: actual.time,
        venue: booking.venue,
        staffNames: booking.staffNames,
        securityDeposit,
        totalPrice,
        totalAdvance,
        totalRemaining,
        remainingCollected: remainingPaid,
        securityRefunded,
        lateFee: late ? 0 : 0,
        damageCharge,
        finalSettlement,
        commonNotes: booking.commonNotes,
        returnNotes: booking.incompleteNotes || booking.deliveryNotes,
        status: booking.status,
        createdAt: booking.createdAt.toISOString(),
        isLateReturn: late,
      },
      items,
      orders: activeSlipOrders(booking),
    };
  }

  // Partial return — delta items only
  const scope = opts?.scope;
  if (deltaItems?.length) {
    sourceItems = deltaItems;
    slipSubtitle =
      deltaItems.length === 1
        ? `Partial return — 1 dress (${deltaItems[0].dressName})`
        : `Partial return — ${deltaItems.length} dress(es)`;
  } else if (scope === "single" && opts?.bookingItemId) {
    const bi = returnedItems.find((b) => b.id === opts.bookingItemId);
    if (!bi) throw new Error("Returned booking item not found");
    sourceItems = [bi];
    slipSubtitle = `Partial return — 1 of ${deliveredItems.length} dresses returned (${bi.dressName})`;
  } else {
    sourceItems = returnedItems;
    slipSubtitle = `Partial return — ${returnedItems.length} of ${deliveredItems.length} dresses returned`;
  }

  totalPrice = sourceItems.reduce((s, i) => s + i.price, 0);
  totalAdvance = sourceItems.reduce((s, i) => s + i.advance, 0);
  totalRemaining = sourceItems.reduce((s, i) => s + i.remaining, 0);
  remainingPaid = sourceItems.reduce((s, i) => s + (i.itemRemainingCollected ?? 0), 0);
  securityDeposit = sourceItems.reduce((s, i) => s + (i.itemSecurityCollected ?? 0), 0);
  securityRefunded = 0;
  damageCharge = sourceItems.reduce((s, i) => s + (i.itemSecurityHeld ?? 0), 0);
  const balanceDue = Math.max(0, totalRemaining - remainingPaid);
  finalSettlement = balanceDue > 0 ? balanceDue : damageCharge > 0 ? damageCharge : 0;
  if (!returnedAt) returnedAt = new Date();

  const actual = formatSlipDateTime(returnedAt);
  const late = isLateReturn(returnedAt, booking.returnDate);

  const displayItems = [
    ...sourceItems,
    ...cancelledItems.filter((c) => !sourceItems.some((s) => s.id != null && s.id === c.id)),
  ];

  return {
    slipSubtitle,
    booking: {
      publicBookingId: publicId,
      monthlySerial: booking.monthlySerial,
      customerName: booking.customerName,
      customerAddress: booking.customerAddress,
      contact1: booking.contact1,
      whatsappNo: booking.whatsappNo,
      deliveryDate: formatDate(booking.deliveryDate, "display"),
      deliveryTime: booking.deliveryTime,
      returnDate: formatDate(booking.returnDate, "display"),
      returnTime: booking.returnTime,
      actualReturnDate: actual.date,
      actualReturnTime: actual.time,
      venue: booking.venue,
      staffNames: booking.staffNames,
      securityDeposit,
      totalPrice,
      totalAdvance,
      totalRemaining,
      remainingCollected: remainingPaid,
      securityRefunded,
      lateFee: 0,
      damageCharge,
      finalSettlement,
      commonNotes: booking.commonNotes,
      returnNotes: booking.deliveryNotes,
      status: booking.status,
      createdAt: booking.createdAt.toISOString(),
      isLateReturn: late,
    },
    items: displayItems.map(mapReturnSlipItem),
    orders: activeSlipOrders(booking),
  };
}

export const SLIP_BIZ = {
  name: process.env.BUSINESS_NAME || BRAND_FULL_NAME,
  phone: process.env.BUSINESS_PHONE || BRAND_PHONES_DISPLAY,
  address: process.env.BUSINESS_ADDRESS || BRAND_ADDRESS_DEFAULT,
  tagline: process.env.BUSINESS_TAGLINE || BRAND_MOTTO,
};

export function buildBookingSlipData(booking: BookingWithItems): {
  booking: BookingSlipProps["booking"];
  items: BookingSlipProps["items"];
  orders: SlipOrder[];
} {
  const publicId = resolvePublicBookingId(booking);
  const bookingWhen = formatBookingDateTime(booking.createdAt);

  const items =
    booking.bookingItems.length > 0
      ? booking.bookingItems.map((bi) => ({
          dressName: bi.dressName,
          category: bi.category || "",
          size: bi.size || "",
          color: bi.item?.color ?? null,
          price: bi.price,
          advance: bi.advance,
          remaining: bi.remaining,
          notes: bi.notes,
          photoUrl: bi.item ? photoUrl(inventoryPhotoRef(bi.item)) || null : null,
        }))
      : booking.dressName
        ? [
            {
              dressName: booking.dressName,
              category: "",
              size: "",
              color: null,
              price: booking.totalPrice,
              advance: booking.totalAdvance,
              remaining: booking.totalRemaining,
              notes: null,
            },
          ]
        : [];

  return {
    booking: {
      publicBookingId: publicId,
      monthlySerial: booking.monthlySerial,
      customerName: booking.customerName,
      customerAddress: booking.customerAddress,
      contact1: booking.contact1,
      whatsappNo: booking.whatsappNo,
      deliveryDate: formatDate(booking.deliveryDate, "display"),
      deliveryTime: booking.deliveryTime,
      returnDate: formatDate(booking.returnDate, "display"),
      returnTime: booking.returnTime,
      bookingDate: bookingWhen.date,
      bookingTime: bookingWhen.time,
      venue: booking.venue,
      staffNames: booking.staffNames,
      securityDeposit: booking.securityDeposit,
      totalPrice: booking.totalPrice,
      totalAdvance: booking.totalAdvance,
      totalRemaining: booking.totalRemaining,
      commonNotes: booking.commonNotes,
      status: booking.status,
      createdAt: booking.createdAt.toISOString(),
    },
    items,
    orders: activeSlipOrders(booking),
  };
}

export function buildIncompleteSlipData(
  booking: BookingWithItems,
  opts?: { bookingItemIds?: number[] },
) {
  const publicId = resolvePublicBookingId(booking);
  const reported = formatSlipDateTime(booking.returnedAt ?? new Date());
  const security = incompleteReturnSecuritySummary({
    securityHeld: booking.securityHeld,
    securityCollected: booking.securityCollected,
    securityDeposit: booking.securityDeposit,
    items: booking.bookingItems,
  });

  const incompleteFilter = (bi: BookingWithItems["bookingItems"][number]) => {
    if (!bi.isIncompleteReturn) return false;
    if (opts?.bookingItemIds?.length) {
      return bi.id != null && opts.bookingItemIds.includes(bi.id);
    }
    return true;
  };

  const incompleteItems = booking.bookingItems
    .filter(incompleteFilter)
    .map((bi) => ({
      dressName: bi.dressName,
      category: bi.category || "",
      size: bi.size || "",
      color: bi.item?.color ?? null,
      notes: bi.itemIncompleteNotes || bi.notes,
      securityHeld: bi.itemSecurityHeld,
      photo: bi.itemIncompletePhoto,
    }));

  if (
    incompleteItems.length === 0 &&
    (booking.status === "incomplete_return" || booking.incompleteNotes || booking.incompletePhoto)
  ) {
    incompleteItems.push({
      dressName: booking.dressName || "Rented item",
      category: "",
      size: "",
      color: null,
      notes: booking.incompleteNotes,
      securityHeld: booking.securityHeld,
      photo: booking.incompletePhoto,
    });
  }

  const returnedItems = booking.bookingItems
    .filter((bi) => bi.isReturned && !bi.isIncompleteReturn)
    .map((bi) => ({
      dressName: bi.dressName,
      category: bi.category || "",
      size: bi.size || "",
    }));

  return {
    booking: {
      publicBookingId: publicId,
      monthlySerial: booking.monthlySerial,
      customerName: booking.customerName,
      customerAddress: booking.customerAddress,
      contact1: booking.contact1,
      whatsappNo: booking.whatsappNo,
      deliveryDate: formatDate(booking.deliveryDate, "display"),
      deliveryTime: booking.deliveryTime,
      returnDate: formatDate(booking.returnDate, "display"),
      returnTime: booking.returnTime,
      reportedDate: reported.date,
      reportedTime: reported.time,
      venue: booking.venue,
      staffNames: booking.staffNames,
      securityDeposit: booking.securityDeposit,
      securityCollected: security.totalSecurity,
      securityHeld: security.securityHeld,
      securityReturned: security.securityReturned,
      incompleteNotes: booking.incompleteNotes,
      incompletePhoto: booking.incompletePhoto,
      status: booking.status,
    },
    incompleteItems,
    returnedItems,
  };
}
