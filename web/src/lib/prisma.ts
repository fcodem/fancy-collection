import { PrismaClient } from "@prisma/client";
import { logSafeDatabaseConfig } from "./dbConfigLog";

/**
 * Date helpers for Prisma queries.
 * With PostgreSQL, DateTime is handled natively — use `new Date()` for writes.
 * The `*Q` helpers below return Date objects for convenient date-range queries.
 */

/** Map Vercel Supabase integration vars (POSTGRES_*) onto DATABASE_URL / DIRECT_URL. */
function applyRuntimeSupabaseEnvAliases() {
  if (!process.env.DATABASE_URL?.trim()) {
    const mapped =
      process.env.POSTGRES_PRISMA_URL?.trim() ||
      process.env.POSTGRES_URL?.trim() ||
      "";
    if (mapped) process.env.DATABASE_URL = mapped;
  }
  if (!process.env.DIRECT_URL?.trim()) {
    const mapped = process.env.POSTGRES_URL_NON_POOLING?.trim() || "";
    if (mapped) process.env.DIRECT_URL = mapped;
  }
  // Never use blocked direct host on Vercel when a pooler DATABASE_URL exists.
  const dbUrl = process.env.DATABASE_URL?.trim() || "";
  const direct = process.env.DIRECT_URL?.trim() || "";
  if (
    process.env.VERCEL &&
    /@db\.[a-z0-9]+\.supabase\.co:/i.test(direct) &&
    /pooler\.supabase\.com/i.test(dbUrl)
  ) {
    process.env.DIRECT_URL = dbUrl
      .replace(/:6543\b/g, ":5432")
      .replace(/([?&])pgbouncer=true&?/gi, "$1")
      .replace(/([?&])connection_limit=\d+&?/gi, "$1")
      .replace(/\?&/g, "?")
      .replace(/[?&]$/g, "");
  }
}

applyRuntimeSupabaseEnvAliases();
if (process.env.VERCEL === "1" || process.env.NODE_ENV === "production") {
  logSafeDatabaseConfig("prisma-init");
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function dateToISO(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  if (typeof d === "string") return d;
  return d.toISOString();
}

export function dateQ(d: Date | string): Date {
  if (typeof d === "string") return new Date(d);
  return d;
}

export function parseDateQ(s: string): Date {
  const [y, m, day] = s.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, day || 1));
}

/** True when using local SQLite file DB (Prisma mishandles lt/lte on TEXT datetimes). */
export function isSqliteDb(): boolean {
  return (process.env.DATABASE_URL || "").startsWith("file:");
}

export function dateIsoStart(dateStr: string): string {
  return `${dateStr.slice(0, 10)}T00:00:00.000Z`;
}

/** Exclusive upper bound: start of the day after `dateStr`. */
export function dateIsoEndExclusive(dateStr: string): string {
  const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString();
}

export function deliveryRangeFilter(fromStr: string, toStr: string): { gte: Date; lt: Date } {
  const to = toStr || fromStr;
  const [y, m, d] = to.slice(0, 10).split("-").map(Number);
  return { gte: parseDateQ(fromStr), lt: new Date(Date.UTC(y, m - 1, d + 1)) };
}

export function todayStartQ(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

export function todayEndQ(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + 1));
}

export function startOfMonthQ(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export function endOfMonthQ(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
}

/**
 * Tune DATABASE_URL for Vercel/serverless + Supabase pooler.
 * connection_limit must be >1 so Promise.all dashboard queries don't starve the pool.
 * Never force TLS on localhost — local Postgres usually has no SSL.
 */
export function normalizeDatabaseUrl(raw: string | undefined): string | undefined {
  if (!raw?.trim()) return raw;
  const url = raw.trim();
  if (url.startsWith("file:")) return url;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const isLocalHost =
      host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";

    if (isLocalHost) {
      if (!parsed.searchParams.has("sslmode")) {
        parsed.searchParams.set("sslmode", "disable");
      }
      return parsed.toString();
    }

    const isRemoteProd =
      process.env.VERCEL === "1" ||
      process.env.NODE_ENV === "production" ||
      /pooler\.supabase\.com/i.test(parsed.host) ||
      /\.supabase\.co$/i.test(host);

    if (isRemoteProd) {
      const port = parsed.port || (url.includes(":6543") ? "6543" : "");
      if (port === "6543" && !parsed.searchParams.has("pgbouncer")) {
        parsed.searchParams.set("pgbouncer", "true");
      }
      // 3 = dashboard lists Promise.all (overdue + subcats + orders) after consolidated stats;
      // keep ≤3 for Supabase pooler; do not raise without measuring P2024 under load.
      parsed.searchParams.set("connection_limit", "3");
      parsed.searchParams.set("connect_timeout", "10");
      parsed.searchParams.set("pool_timeout", "15");
      if (!parsed.searchParams.has("sslmode")) {
        parsed.searchParams.set("sslmode", "require");
      }
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

function createPrismaClient() {
  const url = normalizeDatabaseUrl(process.env.DATABASE_URL);
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    ...(url ? { datasources: { db: { url } } } : {}),
  });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const prisma = globalForPrisma.prisma ?? createPrismaClient();

// Reuse across hot reloads (dev) and warm serverless isolates (Vercel).
globalForPrisma.prisma = prisma;

export { prisma };
export default prisma;
