import { createHash } from "node:crypto";
import type {
  ScannedDressAvailabilityResult,
  ScannedDressAvailabilityStatus,
  ScannedDressBookingRecord,
} from "@/lib/services/scannedDressAvailability";

/**
 * Request/response/cache helpers for POST /api/dress-checker/scan-availability.
 * Kept out of the route file so the request contract, cache behaviour and
 * serialization stay unit-testable, and so raw scanned values never need to
 * appear in logs or cache keys (only a short hash does).
 */

export const SCAN_AVAILABILITY_MAX_CODE_LENGTH = 512;
const MAX_DATE_LENGTH = 64;

export class ScanAvailabilityRequestError extends Error {
  constructor(
    message: string,
    public readonly httpStatus: number,
  ) {
    super(message);
    this.name = "ScanAvailabilityRequestError";
  }
}

export type ScanAvailabilityRequest = {
  code: string;
  deliveryDateTime: string;
  returnDateTime: string;
  excludeBookingId: number | null;
};

/** Strict body validation. Rejects early, before any normalization work. */
export function parseScanAvailabilityRequest(body: unknown): ScanAvailabilityRequest {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ScanAvailabilityRequestError("Request body must be a JSON object.", 400);
  }
  const raw = body as Record<string, unknown>;

  const code = raw.code;
  if (typeof code !== "string" || !code.trim()) {
    throw new ScanAvailabilityRequestError("A scanned code is required.", 400);
  }
  if (code.length > SCAN_AVAILABILITY_MAX_CODE_LENGTH) {
    throw new ScanAvailabilityRequestError(
      `Scanned code cannot exceed ${SCAN_AVAILABILITY_MAX_CODE_LENGTH} characters.`,
      400,
    );
  }

  for (const field of ["deliveryDateTime", "returnDateTime"] as const) {
    const value = raw[field];
    if (typeof value !== "string" || !value.trim()) {
      throw new ScanAvailabilityRequestError(`${field} is required.`, 400);
    }
    if (value.length > MAX_DATE_LENGTH) {
      throw new ScanAvailabilityRequestError(`${field} is not a valid date/time.`, 400);
    }
  }

  const excludeRaw = raw.excludeBookingId;
  let excludeBookingId: number | null = null;
  if (excludeRaw != null) {
    if (typeof excludeRaw !== "number" || !Number.isSafeInteger(excludeRaw) || excludeRaw <= 0) {
      throw new ScanAvailabilityRequestError(
        "excludeBookingId must be a positive booking ID.",
        400,
      );
    }
    excludeBookingId = excludeRaw;
  }

  return {
    code,
    deliveryDateTime: (raw.deliveryDateTime as string).trim(),
    returnDateTime: (raw.returnDateTime as string).trim(),
    excludeBookingId,
  };
}

/** Short one-way hash so diagnostics and cache keys never carry scanned values. */
export function hashScanCode(normalizedCode: string): string {
  return createHash("sha256").update(normalizedCode).digest("hex").slice(0, 16);
}

/**
 * Cache key: hashed code + exact date range + exclusion + user + booking
 * revision. The revision advances on every staff mutation (activity log), so
 * booking changes invalidate cached answers without an explicit bus.
 */
export function scanAvailabilityCacheKey(parts: {
  userId: number | string;
  revision: string;
  codeHash: string;
  deliveryDateTime: string;
  returnDateTime: string;
  excludeBookingId: number | null;
}): string {
  return [
    "scan-availability",
    String(parts.userId),
    parts.revision,
    parts.codeHash,
    parts.deliveryDateTime,
    parts.returnDateTime,
    parts.excludeBookingId == null ? "-" : String(parts.excludeBookingId),
  ].join("|");
}

export type ScanCacheStatus = "hit" | "miss" | "coalesced";

/**
 * Small bounded TTL cache with request coalescing. Values expire after
 * `ttlMs` (15–30s for scan availability) and the store never exceeds
 * `maxEntries`; failed loads are never cached.
 */
export function createBoundedTtlCache<T>(opts: { ttlMs: number; maxEntries: number }) {
  const store = new Map<string, { value: T; expiresAt: number }>();
  const pending = new Map<string, Promise<T>>();

  function evictForInsert() {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (entry.expiresAt <= now) store.delete(key);
    }
    while (store.size >= opts.maxEntries) {
      const oldest = store.keys().next().value as string | undefined;
      if (oldest == null) break;
      store.delete(oldest);
    }
  }

  async function get(
    key: string,
    loader: () => Promise<T>,
  ): Promise<{ value: T; cacheStatus: ScanCacheStatus }> {
    const entry = store.get(key);
    if (entry && entry.expiresAt > Date.now()) {
      return { value: entry.value, cacheStatus: "hit" };
    }

    const inflight = pending.get(key);
    if (inflight) {
      return { value: await inflight, cacheStatus: "coalesced" };
    }

    const run = loader()
      .then((value) => {
        evictForInsert();
        store.set(key, { value, expiresAt: Date.now() + opts.ttlMs });
        return value;
      })
      .finally(() => {
        pending.delete(key);
      });
    pending.set(key, run);
    return { value: await run, cacheStatus: "miss" };
  }

  return {
    get,
    clear() {
      store.clear();
      pending.clear();
    },
    size: () => store.size,
  };
}

export function scanAvailabilityHttpStatus(
  status: ScannedDressAvailabilityStatus,
): number {
  // A booked dress is a successful answer, not an HTTP error.
  return status === "CODE_NOT_FOUND" ? 404 : 200;
}

function serializeRecord(record: ScannedDressBookingRecord) {
  return {
    bookingId: record.bookingId,
    bookingNumber: record.bookingNumber,
    monthlySerial: record.monthlySerial,
    customerName: record.customerName,
    contact: record.contact,
    dressName: record.dressName,
    deliveryDateTime: `${record.deliveryDate} ${record.deliveryTime}`.trim(),
    returnDateTime: `${record.returnDate} ${record.returnTime}`.trim(),
    bookingStatus: record.bookingStatus,
    itemStatus: record.itemStatus,
    reason: record.reason,
  };
}

export function serializeScanAvailability(
  result: ScannedDressAvailabilityResult,
  timing: Record<string, number | string | boolean | undefined>,
) {
  return {
    ok: result.status !== "CODE_NOT_FOUND",
    status: result.status,
    dress: result.dress
      ? {
          id: result.dress.id,
          name: result.dress.name,
          sku: result.dress.sku,
          category: result.dress.category,
          size: result.dress.size,
          colour: result.dress.color,
          status: result.dress.status,
          thumbnailUrl: result.dress.thumbnailUrl,
        }
      : null,
    blockingRecords: result.blockingRecords.map(serializeRecord),
    warningRecords: result.warningRecords.map(serializeRecord),
    ...(result.status === "CODE_NOT_FOUND"
      ? { error: "No dress is linked to this QR/barcode." }
      : {}),
    timing,
  };
}
