/**
 * Per-instance Prisma concurrency gauge.
 *
 * Tracks how many Prisma operations are in-flight at once on this serverless
 * isolate so we can prove pool pressure (connection_limit = 3) instead of
 * guessing. This is instrumentation only — it never blocks or serializes
 * queries, so it cannot deadlock interactive transactions.
 *
 * The gauge is a process-global (one per runtime instance), matching the
 * lifetime of the Prisma singleton and the connection pool it owns.
 */

type Gauge = {
  inFlight: number;
  maxInFlight: number;
  totalQueries: number;
};

const KEY = "__fc_prisma_gauge__";

function gauge(): Gauge {
  const g = globalThis as unknown as Record<string, Gauge | undefined>;
  if (!g[KEY]) {
    g[KEY] = { inFlight: 0, maxInFlight: 0, totalQueries: 0 };
  }
  return g[KEY]!;
}

export function beginPrismaQuery(): void {
  const g = gauge();
  g.inFlight += 1;
  g.totalQueries += 1;
  if (g.inFlight > g.maxInFlight) g.maxInFlight = g.inFlight;
}

export function endPrismaQuery(): void {
  const g = gauge();
  g.inFlight = Math.max(0, g.inFlight - 1);
}

/** Highest simultaneous Prisma operation count seen on this instance. */
export function getMaxConcurrentQueries(): number {
  return gauge().maxInFlight;
}

export function getInFlightQueries(): number {
  return gauge().inFlight;
}

export function getTotalQueries(): number {
  return gauge().totalQueries;
}

/** Reset the high-water mark (does not touch in-flight). Used by load tests. */
export function resetMaxConcurrentQueries(): void {
  gauge().maxInFlight = gauge().inFlight;
}

export function prismaGaugeSnapshot(): Gauge {
  return { ...gauge() };
}
