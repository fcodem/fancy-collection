import prisma from "@/lib/prisma";
import { whereDeliveryInRange } from "@/lib/bookingDateQuery";
import { addDaysIso } from "@/lib/dateInput";
import { formatDate, todayIso } from "@/lib/constants";
import { bookingItemSize, dressDisplayName } from "@/lib/dress";
import { isStarBooking } from "@/lib/starBooking";
import { packingDivision, PACKING_DIVISIONS } from "@/lib/packingDivision";
import { sortByDeliverySchedule } from "@/lib/bookingDeliverySort";

export type TomorrowPackingItem = {
  biId: number | null;
  dressName: string;
  displayName: string;
  category: string;
  inventorySubCategory: string;
  size: string;
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
    key: "mens" | "womens" | "jewellery" | "other";
    label: string;
    packingLeft: TomorrowPackingBooking[];
    packingDone: TomorrowPackingBooking[];
  }>;
};

function isBookingPackingDone(items: TomorrowPackingItem[]): boolean {
  if (!items.length) return false;
  return items.every((item) => item.isPackedReady);
}

export async function getTomorrowPackingPageData(): Promise<TomorrowPackingPageData> {
  const tomorrowIso = addDaysIso(todayIso(), 1);
  const dateWhere = await whereDeliveryInRange(tomorrowIso, tomorrowIso);

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
          item: { select: { size: true, name: true, category: true, subCategory: true } },
        },
      },
      legacyItem: { select: { size: true, category: true, name: true } },
    },
  });

  const mapped: TomorrowPackingBooking[] = bookings.map((b) => {
    const items: TomorrowPackingItem[] = b.bookingItems.length
      ? b.bookingItems.map((item) => {
          const size = bookingItemSize(item);
          const name = item.dressName || item.item?.name || "Item";
          const inventorySubCategory = item.item?.subCategory || "";
          const category = item.category || item.item?.category || "";
          return {
            biId: item.id,
            dressName: name,
            displayName: dressDisplayName(name, category, size),
            category,
            inventorySubCategory,
            size,
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

  const packingLeft = sortByDeliverySchedule(mapped.filter((b) => !isBookingPackingDone(b.items)));
  const packingDone = sortByDeliverySchedule(mapped.filter((b) => isBookingPackingDone(b.items)));

  const splitForDivision = (list: TomorrowPackingBooking[], key: string) =>
    list
      .map((booking) => {
        const items = booking.items.filter(
          (item) =>
            packingDivision(item.category, item.dressName, item.inventorySubCategory) === key,
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
    const left = sortByDeliverySchedule(
      splitForDivision(packingLeft, div.key).filter((b) => !isBookingPackingDone(b.items)),
    );
    const done = sortByDeliverySchedule(
      splitForDivision(mapped, div.key).filter((b) => isBookingPackingDone(b.items)),
    );
    return {
      key: div.key,
      label: div.label,
      packingLeft: left,
      packingDone: done,
    };
  }).filter((div) => div.key !== "other" || div.packingLeft.length + div.packingDone.length > 0);

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
