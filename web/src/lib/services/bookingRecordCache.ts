import "server-only";

import { memoryCachedQuery } from "@/lib/perfCache";
import { getFreshShopRevision } from "@/lib/realtime/revision";
import {
  loadBookingRecordCore,
  type BookingRecordCore,
} from "./bookingRecordData";

const CORE_TTL_SECONDS = 20;

/**
 * Short-lived server cache for booking record core (data only).
 * Auth must always run before calling this — never cache permission decisions.
 */
export async function loadCachedBookingRecordCore(
  bookingId: number,
): Promise<BookingRecordCore | null> {
  const revision = await getFreshShopRevision();
  return memoryCachedQuery(
    ["booking-record-core", String(bookingId), revision],
    () => loadBookingRecordCore(bookingId),
    CORE_TTL_SECONDS,
    { staleOnError: true },
  );
}
