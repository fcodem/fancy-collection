import "server-only";

import { logPerf, createPerfTimer, type PerfTimings } from "@/lib/perfTiming";

export type MenuPerfReport = PerfTimings & {
  secondaryQueryMs?: number;
  rowCount?: number;
};

export function createMenuPerfTimer(route: string) {
  return createPerfTimer(route);
}

/** Safe menu perf log — route + timings only, never row contents. */
export function logMenuPerf(report: MenuPerfReport): void {
  logPerf({
    route: report.route,
    requestId: report.requestId,
    cold: report.cold,
    authMs: report.authMs,
    queryMs: report.queryMs,
    warningQueryMs: report.secondaryQueryMs,
    serializeMs: report.serializeMs,
    totalMs: report.totalMs,
    queryCount: report.queryCount,
    cacheStatus: report.cacheStatus,
    rowCount: report.rowCount,
    maxConcurrentQueries: report.maxConcurrentQueries,
  });
}

export const BOOKING_LIST_PAGE_SIZE = 50;
export const LATE_RETURN_PAGE_SIZE = 50;
