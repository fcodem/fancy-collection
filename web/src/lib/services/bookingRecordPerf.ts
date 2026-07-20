import "server-only";

import { createPerfTimer, logPerf, type PerfTimings } from "@/lib/perfTiming";
import { getMaxConcurrentQueries } from "@/lib/prismaConcurrency";

export type BookingRecordPerfReport = PerfTimings & {
  bookingCoreQueryMs?: number;
  bookingItemsQueryMs?: number;
  ordersQueryMs?: number;
  warningQueryMs?: number;
  qrMs?: number;
};

/** Safe perf log for booking record — never logs PII or secrets. */
export function logBookingRecordPerf(report: BookingRecordPerfReport): void {
  logPerf({
    route: report.route ?? "/booking/[id]",
    cold: report.cold,
    authMs: report.authMs,
    queryMs: report.bookingCoreQueryMs,
    warningQueryMs: report.warningQueryMs,
    serializeMs: report.serializeMs,
    totalMs: report.totalMs,
    queryCount: report.queryCount,
    cacheStatus: report.cacheStatus,
    maxConcurrentQueries: report.maxConcurrentQueries ?? getMaxConcurrentQueries(),
  });
}

export function createBookingRecordPerfTimer() {
  return createPerfTimer("/booking/[id]");
}
