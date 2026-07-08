import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildColourAnalysis } from "./colourAnalysis";
import { computeHealthScore } from "./healthScore";
import { buildDuplicateFingerprint } from "./duplicateFingerprint";
import { toCustomerSafeProfile } from "./effectiveProfile";

describe("buildColourAnalysis", () => {
  it("builds palette from recognition fingerprint", () => {
    const result = buildColourAnalysis({
      version: 1,
      colorHistogram: [],
      colorFamily: "green",
      averageHash: "1",
      differenceHash: "2",
      textureDescriptor: [0.1],
      localKeypoints: [1],
      regionHashes: {
        centre: { aHash: "a", dHash: "b" },
        top: { aHash: "a", dHash: "b" },
        bottom: { aHash: "a", dHash: "b" },
        left: { aHash: "a", dHash: "b" },
        right: { aHash: "a", dHash: "b" },
      },
      dominantColors: [{ r: 120, g: 200, b: 100, weight: 0.6 }],
    });
    assert.ok(result.primary);
    assert.ok(result.palette.length > 0);
  });
});

describe("computeHealthScore", () => {
  it("returns zero for missing photo", () => {
    const { score, issues } = computeHealthScore({
      hasPhoto: false,
      sourceImages: {},
      qualityScores: null,
      colourAnalysis: null,
      garmentAttributes: null,
      description: null,
      tags: [],
      duplicateFingerprint: null,
      identificationIndexedAt: null,
      recognitionImage: null,
      profileStatus: "none",
    });
    assert.equal(score, 0);
    assert.equal(issues[0].code, "missing_images");
  });
});

describe("buildDuplicateFingerprint", () => {
  it("returns null without recognition fingerprint", () => {
    assert.equal(buildDuplicateFingerprint(null, {}), null);
  });
});

describe("toCustomerSafeProfile", () => {
  it("applies manual description override", () => {
    const profile = toCustomerSafeProfile({
      itemId: 1,
      status: "completed",
      description: "AI description",
      searchText: "test",
      colourAnalysis: null,
      garmentAttributes: null,
      jewelleryAttributes: null,
      qualityScores: null,
      healthScore: 90,
      healthIssues: [],
      indexedAt: new Date(),
      currentVersion: 1,
      pipelineVersion: "1",
      duplicateFingerprint: null,
      tags: [{ tag: "Bridal", source: "ai" }],
      override: { description: "Manual description" },
    });
    assert.equal(profile.description, "Manual description");
    assert.equal(profile.hasManualOverrides, true);
  });
});
