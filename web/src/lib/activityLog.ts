import prisma from "./prisma";

export type AuditAction =
  | "created"
  | "updated"
  | "deleted"
  | "cancelled"
  | "postponed"
  | "delivered"
  | "returned"
  | "restored"
  | "packed"
  | "attendance"
  | "salary";

export type AuditEntity =
  | "booking"
  | "inventory"
  | "booking_item"
  | "prospect_lead"
  | "shop_enquiry"
  | "staff_attendance"
  | "salary_ledger"
  | "customer";

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
  const raw = b as {
    bookingItems?: Array<{ dressName?: string }>;
    dressName?: string;
    [key: string]: unknown;
  };
  const { bookingItems, legacyItem, ...rest } = raw;
  const items = Array.isArray(bookingItems) ? bookingItems : [];
  const dressNames = items
    .map((bi) => bi.dressName)
    .filter((n): n is string => Boolean(n && String(n).trim()));
  if (!dressNames.length && typeof raw.dressName === "string" && raw.dressName.trim()) {
    dressNames.push(raw.dressName.trim());
  }
  return {
    ...rest,
    dressNames,
    dresses: dressNames.length ? dressNames.join(", ") : null,
  };
}

export function snapshotInventory(i: Record<string, unknown>) {
  const { rentalItems, bookings, bookingItems, prospectLeadItems, ...rest } = i;
  const name = typeof rest.name === "string" ? rest.name : null;
  return { ...rest, dressName: name, dresses: name };
}
