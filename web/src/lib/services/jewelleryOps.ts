import prisma from "../prisma";

import { getAvailableItemsApi } from "../booking";

import { getAllCategories } from "../categories";

import { bookingWarningRecordFrom, type BookingWarningRecord } from "../bookingDetails";

import { formatDate } from "../constants";

import { logActivity } from "../activityLog";

import { deleteUpload } from "../upload";

import {

  allPartsBooked,

  availablePartsForItem,

  formatJewelleryPartsLabel,

  itemHasJewelleryParts,

  mergeBookedParts,

  partsPickedOnSelection,

  picksFromKeys,

  type JewelleryPartKey,

  type JewelleryPickFlags,

} from "../jewelleryParts";



const otherBookingSelect = {

  bookingItems: { select: { itemId: true, dressName: true, category: true, size: true, notes: true } },

  legacyItem: { select: { size: true } },

} as const;



type ItemParts = {

  hasNecklace: boolean;

  hasEarrings: boolean;

  hasTeeka: boolean;

  hasPasa: boolean;

};



export type JewelleryAvailItem = {

  id: number;

  name: string;

  display_name?: string;

  sku?: string;

  category: string;

  color?: string | null;

  size?: string | null;

  sub_category?: string;

  photo?: string;

  has_necklace?: boolean;

  has_earrings?: boolean;

  has_teeka?: boolean;

  has_pasa?: boolean;

  available_parts?: JewelleryPartKey[];

  booked_parts?: JewelleryPartKey[];

  returning_warning?: BookingWarningRecord | null;

  booked_warning?: BookingWarningRecord | null;

};



export type JewellerySelectionRow = {

  id: number;

  itemId: number | null;

  name: string;

  category: string | null;

  photo: string | null;

  source: string;

  note: string | null;

  pickNecklace: boolean;

  pickEarrings: boolean;

  pickTeeka: boolean;

  pickPasa: boolean;

  partsLabel: string;

};



export function serializeJewellerySelections(

  rows: Array<{

    id: number;

    itemId: number | null;

    name: string;

    category: string | null;

    photo: string | null;

    source: string;

    note: string | null;

    pickNecklace?: boolean;

    pickEarrings?: boolean;

    pickTeeka?: boolean;

    pickPasa?: boolean;

  }>,

): JewellerySelectionRow[] {

  return rows.map((r) => {

    const picks = {

      pickNecklace: !!r.pickNecklace,

      pickEarrings: !!r.pickEarrings,

      pickTeeka: !!r.pickTeeka,

      pickPasa: !!r.pickPasa,

    };

    const partsLabel = formatJewelleryPartsLabel(picks);

    return {

      id: r.id,

      itemId: r.itemId,

      name: r.name,

      category: r.category,

      photo: r.photo,

      source: r.source,

      note: r.note,

      pickNecklace: picks.pickNecklace,

      pickEarrings: picks.pickEarrings,

      pickTeeka: picks.pickTeeka,

      pickPasa: picks.pickPasa,

      partsLabel,

    };

  });

}



function classifyOtherSelections<
  T extends {
    itemId: number | null;
    pickNecklace: boolean;
    pickEarrings: boolean;
    pickTeeka: boolean;
    pickPasa: boolean;
    booking: { deliveryDate: Date; returnDate: Date };
  },
>(

  others: T[],

  dIso: string,

  rIso: string,

) {

  const interior: T[] = [];

  const returning: T[] = [];

  const bookedBoundary: T[] = [];



  for (const o of others) {

    if (o.itemId == null) continue;

    const bD = formatDate(o.booking.deliveryDate, "iso");

    const bR = formatDate(o.booking.returnDate, "iso");

    if (bR === dIso) returning.push(o);

    else if (bD === rIso) bookedBoundary.push(o);

    else interior.push(o);

  }



  return { interior, returning, bookedBoundary };

}



export async function getAvailableJewellery(

  bookingId: number,

  category?: string,

): Promise<{ items: JewelleryAvailItem[] }> {

  const booking = await prisma.booking.findUnique({

    where: { id: bookingId },

    select: { deliveryDate: true, returnDate: true },

  });

  if (!booking) throw new Error("Booking not found");



  const dIso = formatDate(booking.deliveryDate, "iso");

  const rIso = formatDate(booking.returnDate, "iso");

  const catFilter = category?.trim() || "";



  const [avail, cats, others, itemPartsRows] = await Promise.all([

    getAvailableItemsApi(dIso, rIso, catFilter, bookingId),

    getAllCategories(),

    prisma.bookingJewellery.findMany({

      where: {

        status: "active",

        itemId: { not: null },

        bookingId: { not: bookingId },

        booking: {

          status: { in: ["booked", "delivered"] },

          deliveryDate: { lte: booking.returnDate },

          returnDate: { gte: booking.deliveryDate },

        },

      },

      select: {

        itemId: true,

        pickNecklace: true,

        pickEarrings: true,

        pickTeeka: true,

        pickPasa: true,

        booking: { include: otherBookingSelect },

      },

    }),

    prisma.clothingItem.findMany({

      where: { itemType: "jewellery" },

      select: { id: true, hasNecklace: true, hasEarrings: true, hasTeeka: true, hasPasa: true },

    }),

  ]);



  const partsById = new Map(itemPartsRows.map((r) => [r.id, r]));



  const jset = new Set(cats.jewellery_categories);

  let items: JewelleryAvailItem[] = (catFilter

    ? (avail.free_items as JewelleryAvailItem[])

    : (avail.free_items as JewelleryAvailItem[]).filter((i) => jset.has(i.category))

  ).map((i) => {

    const p = partsById.get(i.id);

    return {

      ...i,

      has_necklace: p?.hasNecklace ?? false,

      has_earrings: p?.hasEarrings ?? false,

      has_teeka: p?.hasTeeka ?? false,

      has_pasa: p?.hasPasa ?? false,

    };

  });



  const { interior, returning, bookedBoundary } = classifyOtherSelections(others, dIso, rIso);



  const returningInfo: Record<number, BookingWarningRecord> = {};

  const bookedInfo: Record<number, BookingWarningRecord> = {};



  for (const o of returning) {

    if (o.itemId == null) continue;

    if (!returningInfo[o.itemId]) returningInfo[o.itemId] = bookingWarningRecordFrom(o.booking);

  }

  for (const o of bookedBoundary) {

    if (o.itemId == null) continue;

    if (!bookedInfo[o.itemId]) bookedInfo[o.itemId] = bookingWarningRecordFrom(o.booking);

  }



  items = items

    .map((i) => {

      const itemParts: ItemParts = {

        hasNecklace: !!i.has_necklace,

        hasEarrings: !!i.has_earrings,

        hasTeeka: !!i.has_teeka,

        hasPasa: !!i.has_pasa,

      };

      const hasParts = itemHasJewelleryParts(itemParts);



      const interiorForItem = interior.filter((o) => o.itemId === i.id);

      const bookedParts = mergeBookedParts(itemParts, interiorForItem, i.id);

      const availParts = hasParts ? availablePartsForItem(itemParts, bookedParts) : [];

      const bookedPartsList = hasParts ? Array.from(bookedParts) : [];



      if (hasParts && allPartsBooked(itemParts, bookedParts)) {

        return null;

      }

      if (!hasParts && interiorForItem.length > 0) {

        return null;

      }



      return {

        ...i,

        available_parts: availParts,

        booked_parts: bookedPartsList,

        returning_warning: i.returning_warning || returningInfo[i.id] || null,

        booked_warning: i.booked_warning || bookedInfo[i.id] || null,

      };

    })

    .filter((i): i is NonNullable<typeof i> => i !== null);



  items.sort((a, b) => {

    const aWarn = a.returning_warning || a.booked_warning ? 1 : 0;

    const bWarn = b.returning_warning || b.booked_warning ? 1 : 0;

    if (aWarn !== bWarn) return aWarn - bWarn;

    const catCmp = (a.category || "").localeCompare(b.category || "");

    if (catCmp !== 0) return catCmp;

    return (a.display_name || a.name).localeCompare(b.display_name || b.name);

  });



  return { items };

}



export async function addJewellerySelection(

  bookingId: number,

  data: {

    name?: string;

    photo?: string | null;

    itemId?: number | null;

    source?: string;

    category?: string | null;

    note?: string | null;

    pickNecklace?: boolean;

    pickEarrings?: boolean;

    pickTeeka?: boolean;

    pickPasa?: boolean;

  },

  by?: string,

) {

  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, select: { id: true } });

  if (!booking) throw new Error("Booking not found");



  const source = data.itemId ? "inventory" : "manual";

  let name = data.name?.trim() || "";

  let category = data.category ?? null;

  let photo = data.photo || null;

  let pickNecklace = !!data.pickNecklace;

  let pickEarrings = !!data.pickEarrings;

  let pickTeeka = !!data.pickTeeka;

  let pickPasa = !!data.pickPasa;



  if (source === "inventory") {

    const item = await prisma.clothingItem.findUnique({

      where: { id: data.itemId! },

      select: {

        name: true,

        category: true,

        size: true,

        photo: true,

        hasNecklace: true,

        hasEarrings: true,

        hasTeeka: true,

        hasPasa: true,

      },

    });

    if (!item) throw new Error("Jewellery item not found");

    if (!name) name = item.name;

    category = category || item.category;

    if (!photo) photo = item.photo || null;



    const hasParts = itemHasJewelleryParts(item);

    if (hasParts && !pickNecklace && !pickEarrings && !pickTeeka && !pickPasa) {

      throw new Error("Select at least one part (Necklace, Earrings, Teeka, or Pasa) to book.");

    }



    const partsLabel = formatJewelleryPartsLabel({ pickNecklace, pickEarrings, pickTeeka, pickPasa });

    if (partsLabel) name = `${name} (${partsLabel})`;

  }



  if (!name) throw new Error("Enter the jewellery name.");



  const entry = await prisma.bookingJewellery.create({

    data: {

      bookingId,

      itemId: data.itemId || null,

      name,

      category,

      photo,

      source,

      note: data.note?.trim() || null,

      pickNecklace,

      pickEarrings,

      pickTeeka,

      pickPasa,

    },

  });



  logActivity({

    username: by || "system",

    action: "jewellery",

    entity: "booking_jewellery",

    entityId: bookingId,

    label: `Selected jewellery "${name}" for booking #${bookingId}`,

    after: {

      booking_id: bookingId,

      name,

      source,

      item_id: data.itemId || null,

      parts: formatJewelleryPartsLabel({ pickNecklace, pickEarrings, pickTeeka, pickPasa }),

    },

  });



  return entry;

}



export async function removeJewellerySelection(bookingId: number, selectionId: number, by?: string) {

  const entry = await prisma.bookingJewellery.findUnique({ where: { id: selectionId } });

  if (!entry || entry.bookingId !== bookingId) throw new Error("Selection not found");

  if (entry.status !== "active") return;



  await prisma.bookingJewellery.update({ where: { id: selectionId }, data: { status: "removed" } });



  if (entry.source === "manual" && entry.photo) {

    await deleteUpload(entry.photo).catch(() => {});

  }



  logActivity({

    username: by || "system",

    action: "jewellery",

    entity: "booking_jewellery",

    entityId: bookingId,

    label: `Removed jewellery "${entry.name}" from booking #${bookingId}`,

    before: { booking_id: bookingId, name: entry.name, source: entry.source },

  });

}



export async function updateJewellerySelectionPhoto(
  bookingId: number,
  selectionId: number,
  photo: string | null,
  by?: string,
) {
  const entry = await prisma.bookingJewellery.findUnique({ where: { id: selectionId } });
  if (!entry || entry.bookingId !== bookingId) throw new Error("Selection not found");
  if (entry.status !== "active") throw new Error("Selection is not active");

  const newPhoto = photo?.trim() || null;

  // Remove the previous manually-captured photo when it is being replaced.
  if (entry.source === "manual" && entry.photo && entry.photo !== newPhoto) {
    await deleteUpload(entry.photo).catch(() => {});
  }

  await prisma.bookingJewellery.update({ where: { id: selectionId }, data: { photo: newPhoto } });

  logActivity({
    username: by || "system",
    action: "jewellery",
    entity: "booking_jewellery",
    entityId: bookingId,
    label: `Updated photo for jewellery "${entry.name}" in booking #${bookingId}`,
    after: { booking_id: bookingId, name: entry.name, photo: newPhoto },
  });

  return { id: selectionId, photo: newPhoto };
}

export function jewellerySelectionDisplayName(

  name: string,

  picks: JewelleryPickFlags,

): string {

  const label = formatJewelleryPartsLabel(picks);

  if (!label || name.includes(`(${label})`)) return name;

  return `${name} (${label})`;

}



export { picksFromKeys, partsPickedOnSelection };


