import { NextRequest, NextResponse } from "next/server";
import {
  isResponse,
  jsonError,
  requireFastReadUser,
  requireJsonContentType,
} from "@/lib/api";
import { createPerfTimer, withServerTiming } from "@/lib/perfTiming";
import { getFreshShopRevision } from "@/lib/realtime/revision";
import {
  createBoundedTtlCache,
  hashScanCode,
  parseScanAvailabilityRequest,
  ScanAvailabilityRequestError,
  scanAvailabilityCacheKey,
  scanAvailabilityHttpStatus,
  serializeScanAvailability,
} from "@/lib/services/scanAvailabilityApi";
import {
  InventoryScanCodeError,
  normalizeScanCode,
} from "@/lib/services/inventoryScanCode";
import {
  checkScannedDressAvailability,
  ScannedDressAvailabilityError,
  type ScannedDressAvailabilityResult,
} from "@/lib/services/scannedDressAvailability";

export const dynamic = "force-dynamic";

/**
 * Fast authenticated availability check for one scanned dress. Read-only,
 * lean by design: one code lookup + one bounded conflict query in the
 * service, fronted by a short bounded cache for repeated scans.
 *
 * Raw scanned values must never reach logs or cache keys — use codeHash.
 */

const CACHE_TTL_MS = 20_000;
const CACHE_MAX_ENTRIES = 300;

const resultCache = createBoundedTtlCache<ScannedDressAvailabilityResult>({
  ttlMs: CACHE_TTL_MS,
  maxEntries: CACHE_MAX_ENTRIES,
});

function serviceErrorResponse(error: ScannedDressAvailabilityError): NextResponse {
  const status = error.code === "INVALID_DATE_RANGE" ? 409 : 400;
  return jsonError(error.message, status, { code: error.code });
}

export async function POST(request: NextRequest) {
  const perf = createPerfTimer("api/dress-checker/scan-availability");
  const unsupported = requireJsonContentType(request);
  if (unsupported) return unsupported;

  // Fast read-session auth still honours force logout, deactivation and
  // role changes; unauthenticated callers get 401, revoked sessions too.
  const user = await requireFastReadUser(perf);
  if (isResponse(user)) return user;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Request body must be valid JSON.", 400);
  }

  let codeHash = "unparsed";
  try {
    const input = parseScanAvailabilityRequest(body);
    const normalizedCode = normalizeScanCode(input.code);
    codeHash = hashScanCode(normalizedCode);

    // Booking/realtime revision in the key invalidates cached answers as
    // soon as any staff mutation lands, well before the TTL runs out.
    perf.mark("cache");
    const revision = await getFreshShopRevision();
    const cacheKey = scanAvailabilityCacheKey({
      userId: user.id,
      revision,
      codeHash,
      deliveryDateTime: input.deliveryDateTime,
      returnDateTime: input.returnDateTime,
      excludeBookingId: input.excludeBookingId,
    });

    const { value: result, cacheStatus } = await resultCache.get(cacheKey, () =>
      checkScannedDressAvailability({
        rawCode: input.code,
        deliveryDateTime: input.deliveryDateTime,
        returnDateTime: input.returnDateTime,
        excludeBookingId: input.excludeBookingId,
      }),
    );
    perf.endStage("cacheLookupMs", "cache");
    perf.setCacheStatus(cacheStatus);
    perf.set("codeLookupMs", result.timings.codeLookupMs);
    perf.set("conflictQueryMs", result.timings.conflictQueryMs);
    perf.set("classificationMs", result.timings.classificationMs);
    const queriedConflicts = ![
      "CODE_NOT_FOUND",
      "AMBIGUOUS_LEGACY_CODE",
      "MAINTENANCE",
      "INACTIVE",
    ].includes(result.status);
    perf.addQueries(
      cacheStatus === "miss" ? (queriedConflicts ? 3 : 2) : 1,
    );

    const timings = perf.finish({ kind: "read", forceLog: true });
    const payload = serializeScanAvailability(result, {
      authMs: timings.authMs,
      codeLookupMs: result.timings.codeLookupMs,
      conflictQueryMs: result.timings.conflictQueryMs,
      classificationMs: result.timings.classificationMs,
      totalMs: timings.totalMs,
      cacheStatus,
    });
    return withServerTiming(
      NextResponse.json(payload, { status: scanAvailabilityHttpStatus(result.status) }),
      timings,
    ) as NextResponse;
  } catch (error) {
    if (error instanceof ScanAvailabilityRequestError) {
      return jsonError(error.message, error.httpStatus);
    }
    if (error instanceof InventoryScanCodeError) {
      return jsonError(error.message, 400, { code: error.code });
    }
    if (error instanceof ScannedDressAvailabilityError) {
      return serviceErrorResponse(error);
    }
    // Never leak raw Prisma/internal errors or scanned values to the client
    // or the log line — the hashed code is enough to correlate a report.
    console.error(
      `[scan-availability] failed codeHash=${codeHash}`,
      error instanceof Error ? error.name : "UnknownError",
    );
    return jsonError("Unexpected server error. Please try again.", 500);
  }
}
