import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  decodeCursor,
  encodeCursor,
  inventoryFallbackGroupKey,
  type InventoryGroupSummary,
} from "./inventoryList";

function summarizeGroupLikeList(
  groupKey: string,
  items: Array<{
    id: number;
    sku: string;
    name: string;
    category: string;
    size: string | null;
    color: string | null;
    status: string;
    dailyRate: number;
    photo: string | null;
    thumbnailPhoto?: string | null;
    inventoryGroupId: string | null;
    createdAt: Date;
  }>,
): Pick<
  InventoryGroupSummary,
  | "groupKey"
  | "totalQuantity"
  | "availableQuantity"
  | "rentedQuantity"
  | "maintenanceQuantity"
  | "thumbnailUrl"
> {
  const primary = [...items].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id,
  )[0]!;
  const thumb = primary.thumbnailPhoto || primary.photo;
  return {
    groupKey,
    totalQuantity: items.length,
    availableQuantity: items.filter((i) => i.status === "available").length,
    rentedQuantity: items.filter((i) => i.status === "rented").length,
    maintenanceQuantity: items.filter((i) => i.status === "maintenance").length,
    thumbnailUrl: thumb ? `/uploads/${thumb.replace(/^uploads\//, "")}` : null,
  };
}

describe("inventoryList cursor helpers", () => {
  it("encode/decode round-trips name sort cursor", () => {
    const payload = { sort: "name" as const, v1: "Blue Lehenga", v2: "grp-abc" };
    const raw = encodeCursor(payload);
    assert.equal(decodeCursor(raw)?.sort, "name");
    assert.deepEqual(decodeCursor(raw), payload);
  });

  it("encode/decode round-trips newest sort cursor", () => {
    const payload = {
      sort: "newest" as const,
      v1: "2026-07-18T00:00:00.000Z",
      v2: "legacy:Gown|Gown|M|Red",
    };
    assert.deepEqual(decodeCursor(encodeCursor(payload)), payload);
  });

  it("decodeCursor rejects invalid payloads", () => {
    assert.equal(decodeCursor(""), null);
    assert.equal(decodeCursor("not-base64!!!"), null);
    assert.equal(decodeCursor(Buffer.from(JSON.stringify({ sort: "bad" })).toString("base64url")), null);
  });
});

describe("inventory group summaries", () => {
  const base = {
    category: "Lehenga",
    size: "M",
    color: "Blue",
    dailyRate: 5000,
    photo: "full-photo.jpg",
    thumbnailPhoto: "thumbs/thumb.webp",
    inventoryGroupId: "grp-1",
    createdAt: new Date("2026-07-01"),
  };

  it("aggregates quantities by status", () => {
    const summary = summarizeGroupLikeList("grp-1", [
      { id: 1, sku: "ITM-0001", name: "Royal #1", status: "available", ...base },
      { id: 2, sku: "ITM-0002", name: "Royal #2", status: "rented", ...base },
      { id: 3, sku: "ITM-0003", name: "Royal #3", status: "maintenance", ...base },
    ]);
    assert.equal(summary.totalQuantity, 3);
    assert.equal(summary.availableQuantity, 1);
    assert.equal(summary.rentedQuantity, 1);
    assert.equal(summary.maintenanceQuantity, 1);
  });

  it("prefers thumbnailPhoto over full photo in summary", () => {
    const summary = summarizeGroupLikeList("grp-1", [
      { id: 10, sku: "ITM-0010", name: "Sparkle", status: "available", ...base },
    ]);
    assert.match(summary.thumbnailUrl || "", /thumb\.webp$/);
    assert.doesNotMatch(summary.thumbnailUrl || "", /full-photo/);
  });

  it("inventoryFallbackGroupKey strips unit suffix", () => {
    assert.equal(
      inventoryFallbackGroupKey({ name: "Royal #2", category: "Lehenga", size: "M", color: "Blue" }),
      "legacy:Royal|Lehenga|M|Blue",
    );
  });
});
