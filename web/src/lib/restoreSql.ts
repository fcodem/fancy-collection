import type { Prisma } from "@prisma/client";
import { isSqliteDb } from "./prisma";

type Tx = Omit<
  Prisma.TransactionClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

/** SQL placeholders: ? for SQLite legacy, $1..$n for PostgreSQL (Vercel). */
export function ph(count: number): string {
  if (isSqliteDb()) return Array(count).fill("?").join(", ");
  return Array.from({ length: count }, (_, i) => `$${i + 1}`).join(", ");
}

export function boolParam(v: unknown, defaultVal = true): boolean | number {
  let b: boolean;
  if (v === undefined || v === null) b = defaultVal;
  else if (v === false || v === 0 || v === "0") b = false;
  else if (v === true || v === 1 || v === "1") b = true;
  else b = Boolean(v);
  return isSqliteDb() ? (b ? 1 : 0) : b;
}

/** Date for raw INSERT — Postgres rejects ISO strings as text for timestamp columns. */
export function dateParam(v: string | Date | null | undefined): Date | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const parsed = new Date(String(v));
  return isNaN(parsed.getTime()) ? null : parsed;
}

export function dateParamReq(v: string | Date | null | undefined): Date {
  return dateParam(v) ?? new Date();
}

export async function resetAutoincrement(tx: Tx, table: string): Promise<void> {
  if (isSqliteDb()) {
    await tx.$executeRawUnsafe(
      `INSERT OR REPLACE INTO sqlite_sequence (name, seq) VALUES (?, COALESCE((SELECT MAX(id) FROM "${table}"), 0))`,
      table,
    );
    return;
  }
  await tx.$executeRawUnsafe(
    `SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT MAX(id) FROM "${table}"), 1), true)`,
  );
}
