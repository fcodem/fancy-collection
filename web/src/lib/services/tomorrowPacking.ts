import prisma from "@/lib/prisma";
import { whereDeliveryInRange } from "@/lib/bookingDateQuery";
import { addDaysIso } from "@/lib/dateInput";
import { formatDate, todayIso } from "@/lib/constants";
import { bookingItemSize, dressDisplayName } from "@/lib/dress";
import { isStarBooking } from "@/lib/starBooking";
import { resolveEffectiveCategory } from "@/lib/categoryDivision";
import { getCategoryDivisionLists } from "@/lib/categories";
import { packingDivision, PACKING_DIVISIONS } from "@/lib/packingDivision";
import { sortByDeliverySchedule } from "@/lib/bookingDeliverySort";
import { catalogPhotoRef } from "@/lib/catalogPhotoRef";

export type TomorrowPackingItem = {
  biId: number | null;
  dressName: string;
  displayName: string;
  category: string;
  inventorySubCategory: string;
  size: string;
  photo: string;
  isPackedReady: boolean;
  preparedBy: string;
  checkedBy: string;
  packingNote: string;
};

export type TomorrowPackingBooking = {
  id: number;
  serialNo: number;
  customerName: string;
  contact1: string;
  deliveryDate: string;
  deliveryTime: string;
  returnDate: string;
  returnTime: string;
  venue: string;
  commonNotes: string;
  isStar: boolean;
  items: TomorrowPackingItem[];
  packedCount: number;
  pendingCount: number;
};

export type TomorrowPackingPageData = {
  tomorrowIso: string;
  tomorrowDisplay: string;
  packingLeft: TomorrowPackingBooking[];
  packingDone: TomorrowPackingBooking[];
  leftCount: number;
  doneCount: number;
  leftItemCount: number;
  doneItemCount: number;
  divisions: Array<{
    key: "mens" | "womens" | "jewellery";
    label: string;
    packingLeft: TomorrowPackingBooking[];
    packingDone: TomorrowPackingBooking[];
  }>;
};

export async function getTomorrowPackingPageData(): Promise<TomorrowPackingPageData> {
  const tomorrowIso = addDaysIso(todayIso(), 1);
  const dateWhere = await whereDeliveryInRange(tomorrowIso, tomorrowIso);
  const categoryLists = await getCategoryDivisionLists();

  const bookings = await prisma.booking.findMany({
    where: {
      AND: [{ status: "booked" }, dateWhere],
    },
    orderBy: [{ deliveryDate: "asc" }, { id: "asc" }],
    select: {
      id: true,
      monthlySerial: true,
      customerName: true,
      contact1: true,
      deliveryDate: true,
      deliveryTime: true,
      returnDate: true,
      returnTime: true,
      venue: true,
      commonNotes: true,
      createdAt: true,
      itemId: true,
      dressName: true,
      price: true,
      totalPrice: true,
      bookingItems: {
        where: { isCancelled: false },
        select: {
          id: true,
          dressName: true,
          category: true,
          size: true,
          price: true,
          preparedBy: true,
          checkedBy: true,
          isPackedReady: true,
          packingNote: true,
          item: {
            select: {
              size: true,
              name: true,
              category: true,
              subCategory: true,
              photo: true,
              thumbnailPhoto: true,
              originalPhoto: true,
            },
          },
        },
      },
      legacyItem: {
        select: {
          size: true,
          category: true,
          name: true,
          photo: true,
          thumbnailPhoto: true,
          originalPhoto: true,
        },
      },
    },
  });

  const mapped: TomorrowPackingBooking[] = bookings.map((b) => {
    const items: TomorrowPackingItem[] = b.bookingItems.length
      ? b.bookingItems.map((item) => {
          const size = bookingItemSize(item);
          const name = item.dressName || item.item?.name || "Item";
          const inventorySubCategory = item.item?.subCategory || "";
          const category = resolveEffectiveCategory(item.category, item.item?.category);
          return {
            biId: item.id,
            dressName: name,
            displayName: dressDisplayName(name, category, size),
            category,
            inventorySubCategory,
            size,
            photo: item.item ? catalogPhotoRef(item.item) : "",
            isPackedReady: item.isPackedReady,
            preparedBy: item.preparedBy || "",
            checkedBy: item.checkedBy || "",
            packingNote: item.packingNote || "",
          };
        })
      : (() => {
          const name = b.dressName || b.legacyItem?.name || "Item";
          const size = b.legacyItem?.size || "";
          return [
            {
              biId: null,
              dressName: name,
              displayName: dressDisplayName(name, b.legacyItem?.category, size),
              category: b.legacyItem?.category || "",
              inventorySubCategory: "",
              size,
              photo: b.legacyItem ? catalogPhotoRef(b.legacyItem) : "",
              isPackedReady: false,
              preparedBy: "",
              checkedBy: "",
              packingNote: "",
            },
          ];
        })();

    const packedCount = items.filter((i) => i.isPackedReady).length;
    return {
      id: b.id,
      serialNo: b.monthlySerial,
      customerName: b.customerName,
      contact1: b.contact1 || "",
      deliveryDate: formatDate(b.deliveryDate, "iso"),
      deliveryTime: b.deliveryTime,
      returnDate: formatDate(b.returnDate, "iso"),
      returnTime: b.returnTime,
      venue: b.venue || "",
      commonNotes: b.commonNotes || "",
      isStar: isStarBooking(b),
      items,
      packedCount,
      pendingCount: items.length - packedCount,
    };
  });

  // Left list: only dresses still to pack (do not mix already-packed items into "left").
  const packingLeft = sortByDeliverySchedule(
    mapped
      .map((b) => {
        const items = b.items.filter((i) => !i.isPackedReady);
        if (!items.length) return null;
        return { ...b, items, packedCount: 0, pendingCount: items.length };
      })
      .filter((b): b is TomorrowPackingBooking => Boolean(b)),
  );

  // Done list: only packed dresses (including partially packed bookings).
  const packingDone = sortByDeliverySchedule(
    mapped
      .map((b) => {
        const items = b.items.filter((i) => i.isPackedReady);
        if (!items.length) return null;
        return { ...b, items, packedCount: items.length, pendingCount: 0 };
      })
      .filter((b): b is TomorrowPackingBooking => Boolean(b)),
  );

  const splitForDivision = (list: TomorrowPackingBooking[], key: string) =>
    list
      .map((booking) => {
        const items = booking.items.filter(
          (item) =>
            packingDivision(item.category, item.dressName, item.inventorySubCategory, categoryLists) === key,
        );
        if (!items.length) return null;
        const packedCount = items.filter((i) => i.isPackedReady).length;
        return {
          ...booking,
          items,
          packedCount,
          pendingCount: items.length - packedCount,
        };
      })
      .filter((b): b is TomorrowPackingBooking => Boolean(b));

  const divisions = PACKING_DIVISIONS.map((div) => {
    const left = sortByDeliverySchedule(splitForDivision(packingLeft, div.key));
    const done = sortByDeliverySchedule(splitForDivision(packingDone, div.key));
    return {
      key: div.key,
      label: div.label,
      packingLeft: left,
      packingDone: done,
    };
  });

  return {
    tomorrowIso,
    tomorrowDisplay: formatDate(tomorrowIso, "display"),
    packingLeft,
    packingDone,
    leftCount: packingLeft.length,
    doneCount: packingDone.length,
    leftItemCount: packingLeft.reduce((n, b) => n + b.pendingCount, 0),
    doneItemCount: packingDone.reduce((n, b) => n + b.packedCount, 0),
    divisions,
  };
}

/**
 * Same pending-dress count as Tomorrow Packing / dashboard card.
 * Prefer this over ad-hoc SQL so the two surfaces cannot drift.
 */
export async function countTomorrowPackingLeftItems(): Promise<number> {
  const tomorrowIso = addDaysIso(todayIso(), 1);
  const dateWhere = await whereDeliveryInRange(tomorrowIso, tomorrowIso);
  const bookings = await prisma.booking.findMany({
    where: {
      AND: [{ status: "booked" }, dateWhere],
    },
    select: {
      bookingItems: {
        where: { isCancelled: false },
        select: { isPackedReady: true },
      },
    },
  });

  let pending = 0;
  for (const b of bookings) {
    if (!b.bookingItems.length) {
      // Legacy booking with no line items — treated as 1 dress still to pack.
      pending += 1;
      continue;
    }
    pending += b.bookingItems.filter((i) => !i.isPackedReady).length;
  }
  return pending;
}
