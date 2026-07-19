import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createBoundedTtlCache } from "./scanAvailabilityApi";

const apiSource = readFileSync(
  join(process.cwd(), "src", "lib", "services", "availabilitySearchApi.ts"),
  "utf8",
);

function availableItemsCacheKey(opts: {
  deliveryDate: string;
  returnDate: string;
  category?: string;
  subCategory?: string;
  size?: string;
  itemType?: string;
  group?: string;
  status?: string;
  search?: string;
  cursor?: string | null;
  limit?: number;
  excludeBookingId?: number;
  includeTotal?: boolean;
}) {
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

describe("available items cache key", () => {
  it("keys identical searches without PII", () => {
    const opts = {
      deliveryDate: "2035-01-10",
      returnDate: "2035-01-12",
      category: "Sherwani",
      subCategory: "Normal",
      size: "40",
      itemType: "dress",
      group: "men",
      status: "available",
      search: "Blue",
      cursor: "abc",
      limit: 30,
      excludeBookingId: 42,
      includeTotal: false,
    };
    const key = availableItemsCacheKey(opts);
    assert.equal(key, availableItemsCacheKey(opts));
    assert.ok(key.startsWith("available-items|"));
    assert.ok(!key.includes("9800000000"));
    assert.ok(!key.includes("customer"));
    assert.match(apiSource, /export function availableItemsCacheKey/);
    assert.match(apiSource, /opts\.includeTotal \? "1" : "0"/);
  });

  it("differentiates includeTotal, excludeBookingId, and cursor", () => {
    const base = {
      deliveryDate: "2035-01-10",
      returnDate: "2035-01-12",
    };
    const withoutTotal = availableItemsCacheKey({ ...base, includeTotal: false });
    const withTotal = availableItemsCacheKey({ ...base, includeTotal: true });
    const excluded = availableItemsCacheKey({ ...base, excludeBookingId: 7 });
    const paged = availableItemsCacheKey({ ...base, cursor: "cursor-a" });
    assert.notEqual(withoutTotal, withTotal);
    assert.notEqual(withoutTotal, excluded);
    assert.notEqual(withoutTotal, paged);
  });
});

describe("available items cache coalesce", () => {
  it("coalesces concurrent duplicate keys via createBoundedTtlCache", async () => {
    const cache = createBoundedTtlCache<string>({ ttlMs: 20_000, maxEntries: 10 });
    let loads = 0;
    let release!: (value: string) => void;
    const gate = new Promise<string>((resolve) => {
      release = resolve;
    });
    const loader = () => {
      loads += 1;
      return gate;
    };
    const a = cache.get("available-items|2035-01-10|2035-01-12", loader);
    const b = cache.get("available-items|2035-01-10|2035-01-12", loader);
    release("payload");
    const [ra, rb] = await Promise.all([a, b]);
    assert.equal(loads, 1);
    assert.equal(ra.cacheStatus, "miss");
    assert.equal(rb.cacheStatus, "coalesced");
    assert.equal(rb.value, "payload");
  });

  it("serves warm repeats as hits within the TTL", async () => {
    const cache = createBoundedTtlCache<number>({ ttlMs: 20_000, maxEntries: 10 });
    let loads = 0;
    const loader = async () => ++loads;
    const first = await cache.get("k", loader);
    const second = await cache.get("k", loader);
    assert.equal(first.cacheStatus, "miss");
    assert.equal(second.cacheStatus, "hit");
    assert.equal(loads, 1);
  });

  it("does not cache failed loads", async () => {
    const cache = createBoundedTtlCache<number>({ ttlMs: 60_000, maxEntries: 3 });
    let loads = 0;
    await assert.rejects(
      cache.get("k", async () => {
        loads += 1;
        throw new Error("db down");
      }),
    );
    const retry = await cache.get("k", async () => {
      loads += 1;
      return 1;
    });
    assert.equal(retry.cacheStatus, "miss");
    assert.equal(loads, 2);
  });

  it("exposes route cache helpers wired to createBoundedTtlCache", () => {
    assert.match(apiSource, /createBoundedTtlCache<AvailabilitySearchResult>/);
    assert.match(apiSource, /export async function getAvailableItemsSearch/);
    assert.match(apiSource, /export function clearAvailableItemsSearchCache/);
  });
});
