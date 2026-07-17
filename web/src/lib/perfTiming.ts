/**
 * Safe stage timing for booking / delivery / return / dashboard paths.
 * Never log PII, secrets, connection strings, or photo URLs.
 */

export type PerfStage =
  | "authMs"
  | "parseMs"
  | "validationMs"
  | "initialReadMs"
  | "lockMs"
  | "conflictCheckMs"
  | "transactionMs"
  | "databaseWriteMs"
  | "jobEnqueueMs"
  | "responseReadMs"
  | "photoUploadMs"
  | "queryMs"
  | "groupMs"
  | "serializeMs"
  | "thumbnailMs"
  | "compressionMs"
  | "hashMs"
  | "duplicateCheckMs"
  | "uploadMs"
  | "cacheMs"
  | "totalMs";

export type PerfTimings = Partial<Record<PerfStage, number>> & {
  queryCount?: number;
  itemCount?: number;
  cold?: boolean;
  route?: string;
};

const GLOBAL_COLD_KEY = "__fc_perf_warm__";

function isColdInvocation(): boolean {
  const g = globalThis as unknown as Record<string, boolean | undefined>;
  if (g[GLOBAL_COLD_KEY]) return false;
  g[GLOBAL_COLD_KEY] = true;
  return true;
}

export function createPerfTimer(route: string) {
  const t0 = Date.now();
  const marks = new Map<string, number>();
  const stages: PerfTimings = { route, cold: isColdInvocation() };
  let queryCount = 0;

  return {
    mark(name: string) {
      marks.set(name, Date.now());
    },
    /** Elapsed ms from `from` mark (or start) to now, stored as stage. */
    endStage(stage: PerfStage, from?: string) {
      const start = from && marks.has(from) ? marks.get(from)! : t0;
      stages[stage] = Date.now() - start;
      return stages[stage]!;
    },
    set(stage: PerfStage, ms: number) {
      stages[stage] = Math.max(0, Math.round(ms));
    },
    addQueries(n: number) {
      queryCount += n;
      stages.queryCount = queryCount;
    },
    setItemCount(n: number) {
      stages.itemCount = n;
    },
    finish(opts?: { kind?: "read" | "mutation" | "photo"; forceLog?: boolean }) {
      stages.totalMs = Date.now() - t0;
      stages.queryCount = queryCount || stages.queryCount;
      const kind = opts?.kind ?? "mutation";
      const threshold =
        kind === "photo" ? 2500 : kind === "read" ? 750 : 1000;
      const logAll = process.env.PERF_LOG_ALL === "1";
      const shouldLog =
        opts?.forceLog || logAll || (stages.totalMs ?? 0) >= threshold;
      if (shouldLog) {
        logPerf(stages);
      }
      return stages;
    },
    snapshot(): PerfTimings {
      return { ...stages, totalMs: stages.totalMs ?? Date.now() - t0 };
    },
  };
}

export type PerfTimer = ReturnType<typeof createPerfTimer>;

/** Strip anything that looks like a secret or PII before logging. */
function sanitizeForLog(value: unknown): string {
  const s = String(value ?? "");
  if (/postgres(ql)?:\/\//i.test(s)) return "[redacted-url]";
  if (/password|secret|token|bearer/i.test(s) && s.length > 20) return "[redacted]";
  if (/\+?\d{10,}/.test(s)) return "[redacted-phone]";
  return s.slice(0, 120);
}

export function logPerf(timings: PerfTimings) {
  const parts: string[] = [`[perf] route=${sanitizeForLog(timings.route || "unknown")}`];
  for (const key of [
    "authMs",
    "parseMs",
    "validationMs",
    "initialReadMs",
    "lockMs",
    "conflictCheckMs",
    "transactionMs",
    "databaseWriteMs",
    "jobEnqueueMs",
    "responseReadMs",
    "photoUploadMs",
    "queryMs",
    "groupMs",
    "serializeMs",
    "thumbnailMs",
    "compressionMs",
    "hashMs",
    "duplicateCheckMs",
    "uploadMs",
    "cacheMs",
    "totalMs",
  ] as const) {
    const v = timings[key];
    if (typeof v === "number") parts.push(`${key}=${v}`);
  }
  if (typeof timings.queryCount === "number") parts.push(`queryCount=${timings.queryCount}`);
  if (typeof timings.itemCount === "number") parts.push(`itemCount=${timings.itemCount}`);
  if (typeof timings.cold === "boolean") parts.push(`cold=${timings.cold}`);
  console.log(parts.join(" "));
}

/** Build Server-Timing header value from recorded stages. */
export function toServerTimingHeader(timings: PerfTimings): string {
  const entries: string[] = [];
  for (const [k, v] of Object.entries(timings)) {
    if (typeof v !== "number" || k === "queryCount" || k === "itemCount") continue;
    if (!/Ms$/.test(k)) continue;
    const name = k.replace(/Ms$/, "");
    entries.push(`${name};dur=${Math.round(v)}`);
  }
  return entries.join(", ");
}

export function withServerTiming(res: Response, timings: PerfTimings): Response {
  const value = toServerTimingHeader(timings);
  if (!value) return res;
  const headers = new Headers(res.headers);
  headers.set("Server-Timing", value);
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}
