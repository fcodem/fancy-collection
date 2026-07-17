import type { Prisma } from "@prisma/client";

/** Namespace for booking-item advisory locks (stable arbitrary int). */
const BOOKING_ITEM_LOCK_NS = 872_014;

/**
 * Serialize booking create/update for the same inventory items across concurrent
 * transactions (two staff, same dress). Locks are released at transaction end.
 */
export async function lockInventoryItemsForBooking(
  tx: Prisma.TransactionClient,
  itemIds: number[],
): Promise<void> {
  const ids = [...new Set(itemIds.filter((id) => Number.isInteger(id) && id > 0))].sort(
    (a, b) => a - b,
  );
  for (const id of ids) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${BOOKING_ITEM_LOCK_NS}, ${id})`;
  }
}
