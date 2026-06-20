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

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export { prisma };
export default prisma;
