import type { Prisma, PrismaClient } from "@prisma/client";
import prisma from "@/lib/prisma";
import { whereBookingOverlapsPeriod } from "@/lib/bookingDateQuery";
import { formatDate } from "@/lib/constants";
import { stripUnitSuffix } from "@/lib/dress";
import { photoUrl } from "@/lib/photoUrl";
import {
  InventoryScanCodeError,
  normalizeScanCode,
  resolveInventoryFromScannedCodeInDb,
} from "@/lib/services/inventoryScanCode";
import {
  formatJewelleryPartsLabel,
  partsPresentOnItem,
  type JewelleryPartFlags,
} from "@/lib/jewelleryParts";

/**
 * Availability check for one scanned physical dress between a requested
 * delivery and return date/time (Asia/Kolkata).
 *
 * This reuses the application's approved booking overlap rules
 * (booking.ts / availabilitySearch.ts): calendar-day overlap blocks, same-day
 * boundary handovers warn, and cancelled/returned booking items never occupy
 * inventory. Times only refine the boundary days: a warning upgrades to a hard
 * block when the existing booking's time genuinely overlaps the request.
 */

export const SCANNED_DRESS_AVAILABILITY_STATUSES = [
  "AVAILABLE",
  "BOOKED",
  "WARNING_RETURNING_ON_DELIVERY_DAY",
  "WARNING_BOOKED_ON_RETURN_DAY",
  "WARNING_BOTH_BOUNDARIES",
  "MAINTENANCE",
  "INACTIVE",
  "CODE_NOT_FOUND",
  "AMBIGUOUS_LEGACY_CODE",
] as const;

export type ScannedDressAvailabilityStatus =
  (typeof SCANNED_DRESS_AVAILABILITY_STATUSES)[number];

export type ScannedDressAvailabilityInput = {
  rawCode: string;
  deliveryDateTime: string;
  returnDateTime: string;
  excludeBookingId?: number | null;
};

export type ScannedDressRecordReason =
  | "OVERLAPPING_BOOKING"
  | "RETURNING_ON_DELIVERY_DAY"
  | "BOOKED_ON_RETURN_DAY";

export type ScannedDressBookingRecord = {
  bookingId: number;
  bookingNumber: string;
  monthlySerial: number;
  customerName: string;
  contact: string;
  dressName: string;
  deliveryDate: string;
  deliveryTime: string;
  returnDate: string;
  returnTime: string;
  bookingStatus: string;
  itemStatus: string;
  reason: ScannedDressRecordReason;
};

export type ScannedDressSummary = {
  id: number;
  name: string;
  sku: string;
  category: string;
  size: string | null;
  color: string | null;
  status: string;
  thumbnailUrl: string | null;
  /** Catalog photo path/URL for sharp zoom (prefer over thumbnail). */
  photoUrl?: string | null;
  /** Human-readable jewellery parts present (Necklace, Long Har, …). */
  jewelleryPartsLabel?: string | null;
};

export type ScannedDressAvailabilityTimings = {
  codeLookupMs: number;
  conflictQueryMs: number;
  classificationMs: number;
};

export type ScannedDressAvailabilityResult = {
  status: ScannedDressAvailabilityStatus;
  dress: ScannedDressSummary | null;
  /** Units free for the requested window (group-aware). */
  free_quantity: number;
  /** Bookable units in the dress group (excludes maintenance/inactive). */
  total_quantity: number;
  blockingRecords: ScannedDressBookingRecord[];
  warningRecords: ScannedDressBookingRecord[];
  timings: ScannedDressAvailabilityTimings;
};

export class ScannedDressAvailabilityError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "MISSING_CODE"
      | "INVALID_CODE"
      | "MISSING_DATE"
      | "INVALID_DATE"
      | "INVALID_DATE_RANGE"
      | "INVALID_BOOKING_ID",
  ) {
    super(message);
    this.name = "ScannedDressAvailabilityError";
  }
}

/** India has a fixed UTC+05:30 offset with no DST. */
const KOLKATA_OFFSET_MINUTES = 330;
const END_OF_DAY_MINUTES = 23 * 60 + 59;

const MAINTENANCE_STATUSES = new Set(["maintenance", "repair", "cleaning"]);
const INACTIVE_STATUSES = new Set(["inactive", "retired", "archived", "disposed"]);

export type BusinessDateTime = {
  /** Calendar date YYYY-MM-DD in Asia/Kolkata. */
  date: string;
  /** Minutes since Kolkata midnight. */
  minutes: number;
  /** Absolute instant for range validation. */
  epochMs: number;
};

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const OFFSETLESS_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;

/**
 * Parse a delivery/return input as an Asia/Kolkata wall-clock moment.
 * Offset-less values are interpreted in Asia/Kolkata, never server time.
 * Date-only values snap to start of day (delivery) or end of day (return).
 */
export function parseKolkataDateTime(
  raw: unknown,
  boundary: "delivery" | "return",
): BusinessDateTime {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new ScannedDressAvailabilityError(
      `${boundary === "delivery" ? "Delivery" : "Return"} date/time is required.`,
      "MISSING_DATE",
    );
  }
  const value = raw.trim();

  if (DATE_ONLY_RE.test(value)) {
    const minutes = boundary === "delivery" ? 0 : END_OF_DAY_MINUTES;
    const [y, m, d] = value.split("-").map(Number);
    const utcMidnight = new Date(Date.UTC(y, m - 1, d));
    // Date.UTC overflows out-of-range months/days instead of failing.
    const roundTrips =
      utcMidnight.getUTCFullYear() === y &&
      utcMidnight.getUTCMonth() === m - 1 &&
      utcMidnight.getUTCDate() === d;
    if (!roundTrips) {
      throw new ScannedDressAvailabilityError("Invalid date value.", "INVALID_DATE");
    }
    const epochMs =
      utcMidnight.getTime() + (minutes - KOLKATA_OFFSET_MINUTES) * 60_000;
    return { date: value, minutes, epochMs };
  }

  const isoValue = OFFSETLESS_DATETIME_RE.test(value) ? `${value}+05:30` : value;
  const parsed = new Date(isoValue);
  if (Number.isNaN(parsed.getTime())) {
    throw new ScannedDressAvailabilityError("Invalid date value.", "INVALID_DATE");
  }

  // Shift to Kolkata wall clock and read via UTC accessors.
  const shifted = new Date(parsed.getTime() + KOLKATA_OFFSET_MINUTES * 60_000);
  const date = `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
  const minutes = shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
  return { date, minutes, epochMs: parsed.getTime() };
}

/**
 * Booking times are free-text like "11:00 AM", "12:00 Noon", "4:30 PM".
 * Returns minutes since midnight, or null when the value cannot be trusted —
 * unknown times keep the existing calendar-day warning behaviour.
 */
export function parseBookingTimeToMinutes(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const match = raw
    .trim()
    .toUpperCase()
    .match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM|NOON|MIDNIGHT)?$/);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? "0");
  const suffix = match[3];
  if (minutes > 59) return null;
  if (suffix === "NOON") {
    if (hours !== 12) return null;
    hours = 12;
  } else if (suffix === "MIDNIGHT") {
    if (hours !== 12) return null;
    hours = 0;
  } else if (suffix === "AM") {
    if (hours < 1 || hours > 12) return null;
    if (hours === 12) hours = 0;
  } else if (suffix === "PM") {
    if (hours < 1 || hours > 12) return null;
    if (hours !== 12) hours += 12;
  } else if (hours > 23) {
    return null;
  }
  return hours * 60 + minutes;
}

const CONFLICT_BOOKING_SELECT = {
  id: true,
  bookingNumber: true,
  monthlySerial: true,
  customerName: true,
  contact1: true,
  deliveryDate: true,
  deliveryTime: true,
  returnDate: true,
  returnTime: true,
  status: true,
  dressName: true,
  itemId: true,
} as const;

type ConflictBookingRow = {
  id: number;
  bookingNumber: string;
  monthlySerial: number;
  customerName: string;
  contact1: string | null;
  deliveryDate: Date;
  deliveryTime: string;
  returnDate: Date;
  returnTime: string;
  status: string;
  dressName: string | null;
  itemId: number | null;
  bookingItems: Array<{
    itemId: number | null;
    dressName: string;
    isCancelled: boolean;
    isReturned: boolean;
    isDelivered: boolean;
  }>;
};

type AvailabilityDb = Pick<
  PrismaClient,
  "inventoryScanCode" | "clothingItem" | "booking"
>;

const INVENTORY_LOOKUP_SELECT = {
  id: true,
  name: true,
  sku: true,
  category: true,
  size: true,
  color: true,
  status: true,
  thumbnailPhoto: true,
  photo: true,
  inventoryGroupId: true,
  itemType: true,
  hasNecklace: true,
  hasEarrings: true,
  hasTeeka: true,
  hasPasa: true,
  hasSheeshpatti: true,
  hasNath: true,
  hasHathfool: true,
  hasKamarband: true,
  hasRings: true,
  hasLongHar: true,
} satisfies Prisma.ClothingItemSelect;

type LookupInventory = Prisma.ClothingItemGetPayload<{
  select: typeof INVENTORY_LOOKUP_SELECT;
}>;

function recordFrom(
  booking: ConflictBookingRow,
  reason: ScannedDressRecordReason,
): ScannedDressBookingRecord {
  const activeRow = booking.bookingItems.find(
    (row) => !row.isCancelled && !row.isReturned,
  );
  return {
    bookingId: booking.id,
    bookingNumber: booking.bookingNumber,
    monthlySerial: booking.monthlySerial,
    customerName: booking.customerName,
    contact: booking.contact1 || "",
    dressName: activeRow?.dressName || booking.dressName || "",
    deliveryDate: formatDate(booking.deliveryDate, "iso"),
    deliveryTime: booking.deliveryTime,
    returnDate: formatDate(booking.returnDate, "iso"),
    returnTime: booking.returnTime,
    bookingStatus: booking.status,
    itemStatus: activeRow
      ? activeRow.isDelivered
        ? "delivered"
        : "booked"
      : booking.status,
    reason,
  };
}

function validateExcludeBookingId(raw: number | null | undefined): number | null {
  if (raw == null) return null;
  if (!Number.isSafeInteger(raw) || raw <= 0) {
    throw new ScannedDressAvailabilityError(
      "excludeBookingId must be a positive booking ID.",
      "INVALID_BOOKING_ID",
    );
  }
  return raw;
}

export function createScannedDressAvailabilityService(db: AvailabilityDb) {
  async function checkScannedDressAvailability(
    input: ScannedDressAvailabilityInput,
  ): Promise<ScannedDressAvailabilityResult> {
    if (typeof input.rawCode !== "string" || !input.rawCode.trim()) {
      throw new ScannedDressAvailabilityError(
        "A scanned QR/barcode value is required.",
        "MISSING_CODE",
      );
    }

    try {
      normalizeScanCode(input.rawCode);
    } catch (error) {
      if (error instanceof InventoryScanCodeError) {
        throw new ScannedDressAvailabilityError(error.message, "INVALID_CODE");
      }
      throw error;
    }

    const delivery = parseKolkataDateTime(input.deliveryDateTime, "delivery");
    const requestedReturn = parseKolkataDateTime(input.returnDateTime, "return");
    if (requestedReturn.epochMs <= delivery.epochMs) {
      throw new ScannedDressAvailabilityError(
        "Return date/time must be after the delivery date/time.",
        "INVALID_DATE_RANGE",
      );
    }
    const excludeBookingId = validateExcludeBookingId(input.excludeBookingId);

    const timings: ScannedDressAvailabilityTimings = {
      codeLookupMs: 0,
      conflictQueryMs: 0,
      classificationMs: 0,
    };

    // 1. Shared resolver: active scan code, then exact normalized SKU fallback.
    const lookupStart = Date.now();
    const resolved = await resolveInventoryFromScannedCodeInDb<LookupInventory>(
      db,
      input.rawCode,
      INVENTORY_LOOKUP_SELECT,
    );
    timings.codeLookupMs = Date.now() - lookupStart;

    if (resolved.status === "CODE_NOT_FOUND") {
      return {
        status: "CODE_NOT_FOUND",
        dress: null,
        free_quantity: 0,
        total_quantity: 0,
        blockingRecords: [],
        warningRecords: [],
        timings,
      };
    }
    if (resolved.status === "AMBIGUOUS_LEGACY_CODE") {
      return {
        status: "AMBIGUOUS_LEGACY_CODE",
        dress: null,
        free_quantity: 0,
        total_quantity: 0,
        blockingRecords: [],
        warningRecords: [],
        timings,
      };
    }

    const inventory = resolved.inventory!;

    // 2. Expand to sibling units of the SAME size only.
    // Men's inventory historically shared one group across sizes 38/40/42/…;
    // availability + QR must stay size-specific.
    let units: LookupInventory[] = [inventory];
    if (inventory.inventoryGroupId) {
      const siblings = await db.clothingItem.findMany({
        where: { inventoryGroupId: inventory.inventoryGroupId },
        select: INVENTORY_LOOKUP_SELECT,
        orderBy: { id: "asc" },
      });
      const sizeKey = String(inventory.size || "")
        .trim()
        .toLowerCase();
      const sameSize = siblings.filter(
        (row) =>
          String(row.size || "")
            .trim()
            .toLowerCase() === sizeKey,
      );
      if (sameSize.length) units = sameSize;
    }

    const displayUnit =
      units.find((u) => u.id === inventory.id) || units[0] || inventory;
    const partFlags: JewelleryPartFlags = {
      hasNecklace: displayUnit.hasNecklace,
      hasEarrings: displayUnit.hasEarrings,
      hasTeeka: displayUnit.hasTeeka,
      hasPasa: displayUnit.hasPasa,
      hasSheeshpatti: displayUnit.hasSheeshpatti,
      hasNath: displayUnit.hasNath,
      hasHathfool: displayUnit.hasHathfool,
      hasKamarband: displayUnit.hasKamarband,
      hasRings: displayUnit.hasRings,
      hasLongHar: displayUnit.hasLongHar,
    };
    const jewelleryPartsLabel =
      displayUnit.itemType === "jewellery" || partsPresentOnItem(partFlags).length
        ? formatJewelleryPartsLabel(partsPresentOnItem(partFlags)) || null
        : null;
    const thumbRef =
      displayUnit.thumbnailPhoto ||
      units.find((u) => u.thumbnailPhoto)?.thumbnailPhoto ||
      displayUnit.photo ||
      units.find((u) => u.photo)?.photo ||
      null;
    const fullRef =
      displayUnit.photo ||
      units.find((u) => u.photo)?.photo ||
      thumbRef;
    const dress: ScannedDressSummary = {
      id: displayUnit.id,
      name: stripUnitSuffix(displayUnit.name),
      sku: displayUnit.sku,
      category: displayUnit.category,
      size: displayUnit.size,
      color: displayUnit.color,
      status: displayUnit.status,
      thumbnailUrl: thumbRef ? photoUrl(thumbRef) : null,
      photoUrl: fullRef ? photoUrl(fullRef) : null,
      ...(jewelleryPartsLabel ? { jewelleryPartsLabel } : {}),
    };

    const bookableUnits = units.filter(
      (u) =>
        !MAINTENANCE_STATUSES.has(u.status) && !INACTIVE_STATUSES.has(u.status),
    );
    const total_quantity = bookableUnits.length;

    if (bookableUnits.length === 0) {
      const allMaintenance = units.every((u) => MAINTENANCE_STATUSES.has(u.status));
      return {
        status: allMaintenance ? "MAINTENANCE" : "INACTIVE",
        dress,
        free_quantity: 0,
        total_quantity: 0,
        blockingRecords: [],
        warningRecords: [],
        timings,
      };
    }

    const unitIds = bookableUnits.map((u) => u.id);

    // 3. One bounded conflict query for every unit in the dress group.
    //    Cancelled/returned booking items never occupy inventory; legacy
    //    bookings (itemId set, no item rows) still do.
    const conflictStart = Date.now();
    const overlapWhere = await whereBookingOverlapsPeriod(
      delivery.date,
      requestedReturn.date,
    );
    const where: Prisma.BookingWhereInput = {
      ...overlapWhere,
      status: { in: ["booked", "delivered"] },
      ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
      OR: [
        {
          bookingItems: {
            some: {
              itemId: { in: unitIds },
              isCancelled: false,
              isReturned: false,
            },
          },
        },
        { itemId: { in: unitIds }, bookingItems: { none: {} } },
      ],
    };
    const conflicts = (await db.booking.findMany({
      where,
      select: {
        ...CONFLICT_BOOKING_SELECT,
        bookingItems: {
          where: {
            itemId: { in: unitIds },
            isCancelled: false,
            isReturned: false,
          },
          select: {
            itemId: true,
            dressName: true,
            isCancelled: true,
            isReturned: true,
            isDelivered: true,
          },
        },
      },
      orderBy: { deliveryDate: "asc" },
      take: 50,
    })) as ConflictBookingRow[];
    timings.conflictQueryMs = Date.now() - conflictStart;

    // 4-7. Classify each conflict per unit: boundary days warn unless times
    //      prove a genuine overlap; everything else blocks that unit.
    const classifyStart = Date.now();
    const blockedUnitIds = new Set<number>();
    const warnReturningUnitIds = new Set<number>();
    const warnBookedUnitIds = new Set<number>();
    const blockingRecords: ScannedDressBookingRecord[] = [];
    const warningRecords: ScannedDressBookingRecord[] = [];
    const seenBlockKeys = new Set<string>();
    const seenWarnKeys = new Set<string>();

    function touchedUnitIds(booking: ConflictBookingRow): number[] {
      const fromItems = booking.bookingItems
        .map((row) => row.itemId)
        .filter((id): id is number => id != null && unitIds.includes(id));
      if (fromItems.length) return [...new Set(fromItems)];
      if (booking.itemId != null && unitIds.includes(booking.itemId)) {
        return [booking.itemId];
      }
      return [];
    }

    for (const booking of conflicts) {
      const touched = touchedUnitIds(booking);
      if (!touched.length) continue;

      const existingDelivery = formatDate(booking.deliveryDate, "iso");
      const existingReturn = formatDate(booking.returnDate, "iso");
      let reason: ScannedDressRecordReason = "OVERLAPPING_BOOKING";

      if (existingReturn === delivery.date) {
        const existingReturnMinutes = parseBookingTimeToMinutes(booking.returnTime);
        if (existingReturnMinutes != null && existingReturnMinutes > delivery.minutes) {
          reason = "OVERLAPPING_BOOKING";
        } else {
          reason = "RETURNING_ON_DELIVERY_DAY";
        }
      } else if (existingDelivery === requestedReturn.date) {
        const existingDeliveryMinutes = parseBookingTimeToMinutes(booking.deliveryTime);
        if (
          existingDeliveryMinutes != null &&
          existingDeliveryMinutes < requestedReturn.minutes
        ) {
          reason = "OVERLAPPING_BOOKING";
        } else {
          reason = "BOOKED_ON_RETURN_DAY";
        }
      }

      for (const unitId of touched) {
        if (reason === "OVERLAPPING_BOOKING") blockedUnitIds.add(unitId);
        else if (reason === "RETURNING_ON_DELIVERY_DAY") {
          warnReturningUnitIds.add(unitId);
        } else {
          warnBookedUnitIds.add(unitId);
        }
      }

      const recordKey = `${booking.id}:${reason}`;
      if (reason === "OVERLAPPING_BOOKING") {
        if (!seenBlockKeys.has(recordKey)) {
          seenBlockKeys.add(recordKey);
          blockingRecords.push(recordFrom(booking, reason));
        }
      } else if (!seenWarnKeys.has(recordKey)) {
        seenWarnKeys.add(recordKey);
        warningRecords.push(recordFrom(booking, reason));
      }
    }

    const freeUnits = bookableUnits.filter((u) => !blockedUnitIds.has(u.id));
    const free_quantity = freeUnits.length;
    const cleanFree = freeUnits.some(
      (u) => !warnReturningUnitIds.has(u.id) && !warnBookedUnitIds.has(u.id),
    );
    const hasReturningWarning = freeUnits.some((u) =>
      warnReturningUnitIds.has(u.id),
    );
    const hasBookedWarning = freeUnits.some((u) => warnBookedUnitIds.has(u.id));

    let status: ScannedDressAvailabilityStatus = "AVAILABLE";
    if (free_quantity === 0) {
      status = "BOOKED";
    } else if (cleanFree) {
      status = "AVAILABLE";
    } else if (hasReturningWarning && hasBookedWarning) {
      status = "WARNING_BOTH_BOUNDARIES";
    } else if (hasReturningWarning) {
      status = "WARNING_RETURNING_ON_DELIVERY_DAY";
    } else if (hasBookedWarning) {
      status = "WARNING_BOOKED_ON_RETURN_DAY";
    }
    timings.classificationMs = Date.now() - classifyStart;

    return {
      status,
      dress,
      free_quantity,
      total_quantity,
      blockingRecords,
      warningRecords,
      timings,
    };
  }

  return { checkScannedDressAvailability };
}

const service = createScannedDressAvailabilityService(prisma);

export const checkScannedDressAvailability = service.checkScannedDressAvailability;
