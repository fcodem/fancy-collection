import prisma from "./prisma";

export type AuditAction = "created" | "updated" | "deleted" | "cancelled" | "delivered" | "returned" | "restored" | "packed";

export type AuditEntity = "booking" | "inventory" | "booking_item";

interface LogOpts {
  username: string;
  action: AuditAction;
  entity: AuditEntity;
  entityId?: number;
  label?: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

function safeJson(v: Record<string, unknown> | null | undefined): string | null {
  if (!v) return null;
  try {
    return JSON.stringify(v);
  } catch {
    return null;
  }
}

function pickChangedFields(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): { before: Record<string, unknown> | null; after: Record<string, unknown> | null } {
  if (!before || !after) return { before: before ?? null, after: after ?? null };
  const changedBefore: Record<string, unknown> = {};
  const changedAfter: Record<string, unknown> = {};
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of allKeys) {
    if (key === "updatedAt" || key === "createdAt") continue;
    const bVal = JSON.stringify(before[key] ?? null);
    const aVal = JSON.stringify(after[key] ?? null);
    if (bVal !== aVal) {
      changedBefore[key] = before[key] ?? null;
      changedAfter[key] = after[key] ?? null;
    }
  }
  if (Object.keys(changedBefore).length === 0) return { before: null, after: null };
  return { before: changedBefore, after: changedAfter };
}

export async function logActivity(opts: LogOpts) {
  try {
    const { before, after } = pickChangedFields(opts.before, opts.after);
    await prisma.activityLog.create({
      data: {
        username: opts.username,
        action: opts.action,
        entity: opts.entity,
        entityId: opts.entityId,
        label: opts.label || null,
        dataBefore: safeJson(before),
        dataAfter: safeJson(after),
      },
    });
  } catch (err) {
    console.error("[AUDIT LOG] Failed to write:", err);
  }
}

export function snapshotBooking(b: Record<string, unknown>) {
  const { bookingItems, legacyItem, ...rest } = b;
  return rest;
}

export function snapshotInventory(i: Record<string, unknown>) {
  const { rentalItems, bookings, bookingItems, prospectLeadItems, ...rest } = i;
  return rest;
}
