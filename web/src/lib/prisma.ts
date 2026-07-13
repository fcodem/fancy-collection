import { PrismaClient } from "@prisma/client";

/**
 * Date helpers for Prisma queries.
 * With PostgreSQL, DateTime is handled natively — use `new Date()` for writes.
 * The `*Q` helpers below return Date objects for convenient date-range queries.
 */

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
 */
export function normalizeDatabaseUrl(raw: string | undefined): string | undefined {
  if (!raw?.trim()) return raw;
  const url = raw.trim();
  if (url.startsWith("file:")) return url;
  try {
    const parsed = new URL(url);
    const isServerless = process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
    if (isServerless || /pooler\.supabase\.com/i.test(parsed.host)) {
      const port = parsed.port || (url.includes(":6543") ? "6543" : "");
      if (port === "6543" && !parsed.searchParams.has("pgbouncer")) {
        parsed.searchParams.set("pgbouncer", "true");
      }
      // 5 is enough for dashboard parallelism without exhausting Supabase pooler.
      parsed.searchParams.set("connection_limit", "5");
      parsed.searchParams.set("connect_timeout", "15");
      parsed.searchParams.set("pool_timeout", "30");
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
