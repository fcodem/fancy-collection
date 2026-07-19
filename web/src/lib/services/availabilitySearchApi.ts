import { createBoundedTtlCache } from "@/lib/services/scanAvailabilityApi";
import {
  searchAvailableItems,
  type AvailabilitySearchOpts,
  type AvailabilitySearchResult,
} from "@/lib/services/availabilitySearch";

export type AvailableItemsCacheStatus = "hit" | "miss" | "coalesced";

/** Stable cache key for identical date/filter/cursor searches (no PII). */
export function availableItemsCacheKey(opts: AvailabilitySearchOpts): string {
  return [
    "available-items",
    opts.deliveryDate,
    opts.returnDate,
    opts.category?.trim() || "",
    opts.subCategory?.trim() || "",
    opts.size?.trim() || "",
    opts.itemType?.trim() || "",
    opts.group?.trim() || "",
    opts.status?.trim() || "",
    opts.search?.trim() || "",
    opts.cursor ?? "",
    String(opts.limit ?? 0),
    String(opts.excludeBookingId ?? 0),
    opts.includeTotal ? "1" : "0",
  ].join("|");
}

const searchCache = createBoundedTtlCache<AvailabilitySearchResult>({
  ttlMs: 20_000,
  maxEntries: 128,
});

export type AvailableItemsSearchResponse = {
  data: AvailabilitySearchResult;
  cacheStatus: AvailableItemsCacheStatus;
};

/**
 * Brief in-process cache + request coalescing for identical availability searches.
 * Occupied inventory can still appear for up to 20s after a booking mutation; the
 * booking form also uses client-side dedupe. Keeps warm p95 under the 800ms target.
 */
export async function getAvailableItemsSearch(
  opts: AvailabilitySearchOpts,
): Promise<AvailableItemsSearchResponse> {
  const key = availableItemsCacheKey(opts);
  const { value, cacheStatus } = await searchCache.get(key, () => searchAvailableItems(opts));
  return { data: value, cacheStatus };
}

/** Test helper — clears route-level availability cache. */
export function clearAvailableItemsSearchCache() {
  searchCache.clear();
}
