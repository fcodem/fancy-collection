import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  cosineSimilarity,
  cosineToPercent,
  mapConfidence,
  SIGLIP_EMBEDDING_DIM,
} from "./siglipMath";

describe("cosineSimilarity", () => {
  it("returns 1 for identical unit vectors", () => {
    const v = [1, 0, 0];
    assert.equal(cosineSimilarity(v, v), 1);
  });

  it("returns 0 for orthogonal vectors", () => {
    assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  });

  it("returns 0 for empty or mismatched lengths", () => {
    assert.equal(cosineSimilarity([], []), 0);
    assert.equal(cosineSimilarity([1, 2], [1]), 0);
  });

  it("handles general vectors", () => {
    const a = [3, 4];
    const b = [6, 8];
    assert.ok(Math.abs(cosineSimilarity(a, b) - 1) < 1e-9);
  });
});

describe("cosineToPercent", () => {
  it("maps 0..1 to 0..100", () => {
    assert.equal(cosineToPercent(0), 0);
    assert.equal(cosineToPercent(1), 100);
    assert.equal(cosineToPercent(0.876), 88);
  });

  it("clamps out-of-range values", () => {
    assert.equal(cosineToPercent(-0.5), 0);
    assert.equal(cosineToPercent(1.5), 100);
  });
});

describe("mapConfidence", () => {
  it("assigns five stars at 95+", () => {
    const c = mapConfidence(96);
    assert.equal(c.stars, "★★★★★");
    assert.equal(c.reliable, true);
  });

  it("assigns four-and-half stars at 90-94", () => {
    const c = mapConfidence(92);
    assert.equal(c.stars, "★★★★☆");
    assert.ok(c.matchLabel !== "Exact match");
  });

  it("never claims exact match below 90%", () => {
    for (const pct of [70, 80, 89]) {
      const c = mapConfidence(pct);
      assert.ok(!c.matchLabel.toLowerCase().includes("exact"));
    }
  });

  it("marks below 70 as unreliable", () => {
    const c = mapConfidence(65);
    assert.equal(c.reliable, false);
    assert.equal(c.matchLabel, "No reliable match");
  });
});

describe("SIGLIP_EMBEDDING_DIM", () => {
  it("is 768 for siglip-base-patch16-224", () => {
    assert.equal(SIGLIP_EMBEDDING_DIM, 768);
  });
});
