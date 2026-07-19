import type { Prisma, PrismaClient } from "@prisma/client";
import prisma from "@/lib/prisma";
import { whereBookingOverlapsPeriod } from "@/lib/bookingDateQuery";
import { formatDate } from "@/lib/constants";
import {
  InventoryScanCodeError,
  normalizeScanCode,
} from "@/lib/services/inventoryScanCode";

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
};

export type ScannedDressAvailabilityTimings = {
  codeLookupMs: number;
  conflictQueryMs: number;
  classificationMs: number;
};

export type ScannedDressAvailabilityResult = {
  status: ScannedDressAvailabilityStatus;
  dress: ScannedDressSummary | null;
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

type AvailabilityDb = Pick<PrismaClient, "inventoryScanCode" | "booking">;

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

    let normalizedCode: string;
    try {
      normalizedCode = normalizeScanCode(input.rawCode);
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

    // 1. One unique-index lookup, lean select (no AI/embedding columns).
    const lookupStart = Date.now();
    const mapping = await db.inventoryScanCode.findFirst({
      where: { normalizedCode, active: true },
      select: {
        inventory: {
          select: {
            id: true,
            name: true,
            sku: true,
            category: true,
            size: true,
            color: true,
            status: true,
            thumbnailPhoto: true,
          },
        },
      },
    });
    timings.codeLookupMs = Date.now() - lookupStart;

    const inventory = mapping?.inventory ?? null;
    if (!inventory) {
      return {
        status: "CODE_NOT_FOUND",
        dress: null,
        blockingRecords: [],
        warningRecords: [],
        timings,
      };
    }

    const dress: ScannedDressSummary = {
      id: inventory.id,
      name: inventory.name,
      sku: inventory.sku,
      category: inventory.category,
      size: inventory.size,
      color: inventory.color,
      status: inventory.status,
      thumbnailUrl: inventory.thumbnailPhoto || null,
    };

    // 2. Inventory lifecycle states end the check before any booking query.
    if (MAINTENANCE_STATUSES.has(inventory.status)) {
      return {
        status: "MAINTENANCE",
        dress,
        blockingRecords: [],
        warningRecords: [],
        timings,
      };
    }
    if (INACTIVE_STATUSES.has(inventory.status)) {
      return {
        status: "INACTIVE",
        dress,
        blockingRecords: [],
        warningRecords: [],
        timings,
      };
    }

    // 3. One bounded conflict query using the approved overlap window.
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
            some: { itemId: dress.id, isCancelled: false, isReturned: false },
          },
        },
        { itemId: dress.id, bookingItems: { none: {} } },
      ],
    };
    const conflicts = (await db.booking.findMany({
      where,
      select: {
        ...CONFLICT_BOOKING_SELECT,
        bookingItems: {
          where: { itemId: dress.id },
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

    // 4-7. Classify each conflict: boundary days warn unless the recorded
    //      times prove a genuine time overlap, everything else blocks.
    const classifyStart = Date.now();
    const blockingRecords: ScannedDressBookingRecord[] = [];
    const warningRecords: ScannedDressBookingRecord[] = [];
    let hasReturningWarning = false;
    let hasBookedWarning = false;

    for (const booking of conflicts) {
      const existingDelivery = formatDate(booking.deliveryDate, "iso");
      const existingReturn = formatDate(booking.returnDate, "iso");

      if (existingReturn === delivery.date) {
        const existingReturnMinutes = parseBookingTimeToMinutes(booking.returnTime);
        if (existingReturnMinutes != null && existingReturnMinutes > delivery.minutes) {
          blockingRecords.push(recordFrom(booking, "OVERLAPPING_BOOKING"));
        } else {
          hasReturningWarning = true;
          warningRecords.push(recordFrom(booking, "RETURNING_ON_DELIVERY_DAY"));
        }
        continue;
      }

      if (existingDelivery === requestedReturn.date) {
        const existingDeliveryMinutes = parseBookingTimeToMinutes(booking.deliveryTime);
        if (
          existingDeliveryMinutes != null &&
          existingDeliveryMinutes < requestedReturn.minutes
        ) {
          blockingRecords.push(recordFrom(booking, "OVERLAPPING_BOOKING"));
        } else {
          hasBookedWarning = true;
          warningRecords.push(recordFrom(booking, "BOOKED_ON_RETURN_DAY"));
        }
        continue;
      }

      blockingRecords.push(recordFrom(booking, "OVERLAPPING_BOOKING"));
    }
    timings.classificationMs = Date.now() - classifyStart;

    let status: ScannedDressAvailabilityStatus = "AVAILABLE";
    if (blockingRecords.length) {
      status = "BOOKED";
    } else if (hasReturningWarning && hasBookedWarning) {
      status = "WARNING_BOTH_BOUNDARIES";
    } else if (hasReturningWarning) {
      status = "WARNING_RETURNING_ON_DELIVERY_DAY";
    } else if (hasBookedWarning) {
      status = "WARNING_BOOKED_ON_RETURN_DAY";
    }

    return { status, dress, blockingRecords, warningRecords, timings };
  }

  return { checkScannedDressAvailability };
}

const service = createScannedDressAvailabilityService(prisma);

export const checkScannedDressAvailability = service.checkScannedDressAvailability;
