import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pickInventorySyncMatch, syncNameKey } from "./imageSyncMatch";

describe("imageSyncMatch", () => {
  const items = [
    { id: 1, name: "FLORAL", sku: "ITM-0027", photo: null },
    { id: 2, name: "GOLDEN BRIDAL", sku: "ITM-0028", photo: "old.jpg" },
    { id: 3, name: "PINK BRIDAL #1", sku: "ITM-0030", photo: null },
    { id: 4, name: "PINK BRIDAL #2", sku: "ITM-0031", photo: null },
    { id: 5, name: "FISHCUT COFFEE CUTDANA", sku: "ITM-0040", photo: null },
  ];

  it("syncNameKey strips unit suffix", () => {
    assert.equal(syncNameKey("PINK BRIDAL #1"), "pink bridal");
  });

  it("matches exact name case-insensitively", () => {
    const m = pickInventorySyncMatch("golden bridal", items);
    assert.equal(m?.sku, "ITM-0028");
  });

  it("matches base name without unit suffix", () => {
    const m = pickInventorySyncMatch("PINK BRIDAL", items);
    assert.ok(m?.sku === "ITM-0030" || m?.sku === "ITM-0031");
  });

  it("prefers item without photo when several share a base name", () => {
    const m = pickInventorySyncMatch("PINK BRIDAL", items);
    assert.equal(m?.id, 3);
  });

  it("matches multi-word inventory names", () => {
    const m = pickInventorySyncMatch("FISHCUT COFFEE CUTDANA", items);
    assert.equal(m?.sku, "ITM-0040");
  });
});
