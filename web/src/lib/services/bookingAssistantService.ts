import prisma, { parseDateQ } from "@/lib/prisma";
import {
  getAvailableItemsApiCached,
  checkItemAvailabilityForDates,
} from "@/lib/booking";
import { buildDressSearchWhere, dressDisplayName } from "@/lib/dress";
import { todayIso as defaultTodayIso } from "@/lib/constants";
import {
  parseAssistantQuery,
  computeExtendedRange,
  computeMovedRange,
  mapAvailability,
  combineStatus,
  type AssistantIntent,
  type AssistantItemAnswer,
  type AssistantStatus,
  type DateRange,
  type EngineResult,
  type EngineBlockingBooking,
  type ParsedQuery,
} from "./bookingAssistant";
import type { ClothingItem } from "@prisma/client";

/**
 * Read-only orchestration for the AI Booking Assistant.
 *
 * IMPORTANT: This module reads inventory only to identify WHICH dress the user means.
 * All availability decisions are delegated to the existing booking engine:
 *   - getAvailableItemsApiCached  (the exact service the New Booking page uses)
 *   - checkItemAvailabilityForDates (same engine, used to surface the blocking booking)
 * No overlap / date-comparison / business rule is re-implemented here.
 */

export type AssistantResponse = {
  status: AssistantStatus;
  message: string;
  intent: AssistantIntent;
  requested_range: DateRange | null;
  results: AssistantItemAnswer[];
  parsed: {
    intent: AssistantIntent;
    item_query: string | null;
    sku: string | null;
    booking_ref: number | null;
    customer_name: string | null;
    extend_days: number | null;
    move_to: string | null;
  };
};

type BookingRow = {
  id: number;
  monthlySerial: number;
  status: string;
  customerName: string;
  deliveryDate: Date;
  returnDate: Date;
  itemId: number | null;
  bookingItems: { itemId: number; dressName: string; category: string | null }[];
};

const bookingSelect = {
  id: true,
  monthlySerial: true,
  status: true,
  customerName: true,
  deliveryDate: true,
  returnDate: true,
  itemId: true,
  bookingItems: { select: { itemId: true, dressName: true, category: true } },
} as const;

function debugParsed(parsed: ParsedQuery): AssistantResponse["parsed"] {
  return {
    intent: parsed.intent,
    item_query: parsed.itemQuery,
    sku: parsed.sku,
    booking_ref: parsed.bookingRef,
    customer_name: parsed.customerName,
    extend_days: parsed.extendDays,
    move_to: parsed.moveTo,
  };
}

function meta(
  status: AssistantStatus,
  message: string,
  parsed: ParsedQuery,
  range: DateRange | null = null,
): AssistantResponse {
  return {
    status,
    message,
    intent: parsed.intent,
    requested_range: range,
    results: [],
    parsed: debugParsed(parsed),
  };
}

async function resolveItem(parsed: ParsedQuery): Promise<ClothingItem | null> {
  if (parsed.sku) {
    const bySku = await prisma.clothingItem.findFirst({
      where: { sku: { equals: parsed.sku, mode: "insensitive" } },
    });
    if (bySku) return bySku;
  }
  if (parsed.itemQuery) {
    const where = buildDressSearchWhere(parsed.itemQuery);
    if (!where) return null;
    const items = await prisma.clothingItem.findMany({
      where,
      orderBy: [{ name: "asc" }, { size: "asc" }],
      take: 10,
    });
    if (items.length) {
      const q = parsed.itemQuery.toLowerCase();
      const exact = items.find((i) => i.name.toLowerCase() === q);
      return exact ?? items[0];
    }
  }
  return null;
}

async function resolveBooking(ref: number): Promise<BookingRow | null> {
  const bySerial = await prisma.booking.findFirst({
    where: { monthlySerial: ref, status: { in: ["booked", "delivered"] } },
    orderBy: { deliveryDate: "desc" },
    select: bookingSelect,
  });
  if (bySerial) return bySerial as BookingRow;
  const byId = await prisma.booking.findUnique({ where: { id: ref }, select: bookingSelect });
  return (byId as BookingRow) ?? null;
}

function bookingItemIds(b: BookingRow): number[] {
  if (b.bookingItems.length) return b.bookingItems.map((bi) => bi.itemId);
  if (b.itemId != null) return [b.itemId];
  return [];
}

/** Run the availability check for a set of items over one range using the existing engine. */
async function answerForItems(
  items: ClothingItem[],
  range: DateRange,
  today: string,
  excludeBookingId?: number,
): Promise<AssistantItemAnswer[]> {
  const engine = (await getAvailableItemsApiCached(
    range.delivery,
    range.return,
    "",
    excludeBookingId,
  )) as EngineResult;

  const results: AssistantItemAnswer[] = [];
  for (const item of items) {
    const present = engine.free_items.some((f) => f.id === item.id);
    // Only when the engine reports the item as blocked do we ask the engine for the
    // conflicting booking's details (checkItemAvailabilityForDates lives in the same engine).
    let blocking: EngineBlockingBooking = null;
    if (!present) {
      const check = await checkItemAvailabilityForDates(
        item,
        parseDateQ(range.delivery),
        parseDateQ(range.return),
        excludeBookingId,
      );
      blocking = check.blocking_booking;
    }
    results.push(
      mapAvailability({
        item: {
          id: item.id,
          display_name: dressDisplayName(item.name, item.category, item.size),
          name: item.name,
          sku: item.sku,
          category: item.category,
        },
        range,
        engine,
        blocking,
        todayIso: today,
      }),
    );
  }
  return results;
}

function summaryMessage(results: AssistantItemAnswer[], range: DateRange): string {
  if (results.length === 1) return results[0].headline;
  const overall = combineStatus(results);
  const label =
    overall === "available"
      ? "all Available"
      : overall === "available_with_warning"
        ? "Available with warnings"
        : "some Not Available";
  return `Checked ${results.length} items for ${range.delivery} → ${range.return}: ${label}.`;
}

export async function answerBookingQuery(
  query: string,
  todayIso: string = defaultTodayIso(),
): Promise<AssistantResponse> {
  const parsed = parseAssistantQuery(query, todayIso);

  if (parsed.error) {
    return meta("needs_info", parsed.error, parsed);
  }

  // ---- Booking-scoped requests (extend / move / re-check by booking ref) ----
  if (parsed.bookingRef != null) {
    const booking = await resolveBooking(parsed.bookingRef);
    if (!booking) {
      return meta("not_found", `No booking found for #${parsed.bookingRef}.`, parsed);
    }

    let range: DateRange;
    if (parsed.intent === "extend") {
      if (!parsed.extendDays) {
        return meta("needs_info", "How many days should I extend this booking by?", parsed);
      }
      range = computeExtendedRange(booking, parsed.extendDays);
    } else if (parsed.intent === "move") {
      if (!parsed.moveTo) {
        return meta("needs_info", "What new pickup date should I move this booking to?", parsed);
      }
      range = computeMovedRange(booking, parsed.moveTo);
    } else {
      if (!parsed.range) {
        return meta(
          "needs_info",
          `Booking #${parsed.bookingRef} found. What new dates should I check it against?`,
          parsed,
        );
      }
      range = parsed.range;
    }

    const ids = bookingItemIds(booking);
    if (!ids.length) {
      return meta("not_found", `Booking #${parsed.bookingRef} has no linked inventory items to check.`, parsed);
    }
    const items = await prisma.clothingItem.findMany({ where: { id: { in: ids } } });
    if (!items.length) {
      return meta("not_found", `Booking #${parsed.bookingRef} items are no longer in inventory.`, parsed);
    }

    // Exclude the booking itself so its own dates don't count as a conflict.
    const results = await answerForItems(items, range, todayIso, booking.id);
    return {
      status: combineStatus(results),
      message: summaryMessage(results, range),
      intent: parsed.intent,
      requested_range: range,
      results,
      parsed: debugParsed(parsed),
    };
  }

  // ---- Extend / move without a booking reference ----
  if (parsed.intent !== "availability") {
    return meta("needs_info", "Which booking? Please include the booking number (e.g. #145).", parsed);
  }

  // ---- Plain availability request ----
  const item = await resolveItem(parsed);
  if (!item) {
    if (parsed.customerName) {
      const customerBooking = await prisma.booking.findFirst({
        where: { customerName: { contains: parsed.customerName, mode: "insensitive" } },
        select: { id: true },
      });
      if (!customerBooking) {
        return meta("not_found", `No customer or booking found for "${parsed.customerName}".`, parsed);
      }
      return meta(
        "needs_info",
        `Found customer "${parsed.customerName}", but I need the dress name/SKU and dates to check availability.`,
        parsed,
      );
    }
    const label = parsed.sku || parsed.itemQuery || "that dress";
    return meta("not_found", `No dress found matching "${label}".`, parsed);
  }

  if (!parsed.range) {
    return meta(
      "needs_info",
      `Found ${dressDisplayName(item.name, item.category, item.size)}. Which dates should I check? (e.g. "20 July to 23 July")`,
      parsed,
    );
  }

  const results = await answerForItems([item], parsed.range, todayIso);
  return {
    status: combineStatus(results),
    message: summaryMessage(results, parsed.range),
    intent: parsed.intent,
    requested_range: parsed.range,
    results,
    parsed: debugParsed(parsed),
  };
}
