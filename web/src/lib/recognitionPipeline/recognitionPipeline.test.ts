import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { HYBRID_WEIGHTS, CONFIDENCE_BANDS } from "./constants";
import { computeHybridSimilarity, shouldExcludeFromResults } from "./hybridSimilarity";
import { filterCandidates } from "./candidateFilter";
import { scoreToConfidenceBand } from "./confidenceScoring";
import type { RecognitionFeatureFingerprint, StoredRecognitionProfile } from "./types";
import { RECOGNITION_PIPELINE_VERSION } from "./types";

function mockFingerprint(overrides: Partial<RecognitionFeatureFingerprint> = {}): RecognitionFeatureFingerprint {
  return {
    version: RECOGNITION_PIPELINE_VERSION,
    primaryColour: "green",
    secondaryColour: "gold",
    accentColours: [],
    colourHistogram: new Array(36).fill(0.03),
    colourFamily: "green",
    fabricTextureDescriptor: new Array(16).fill(0.1),
    embroideryDensity: 12,
    embroideryStyle: "moderate",
    stoneWork: false,
    mirrorWork: false,
    threadPattern: [0.1, 0.2, 0.3, 0.2, 0.1, 0.05, 0.03, 0.02],
    borderPattern: { averageHash: "12345", differenceHash: "67890", widthRatio: 0.15 },
    sleeveLength: "full",
    necklineShape: "round",
    silhouette: "volume",
    garmentShape: "lehenga",
    dupattaPattern: null,
    dupattaBorder: null,
    motifDistribution: new Array(9).fill(0.11),
    textureFeatures: new Array(16).fill(0.1),
    orbKeypoints: [0.5, 0.5, 0.8],
    localDescriptors: [0.1, 0.2, 0.3],
    garmentBounds: { left: 10, top: 10, width: 200, height: 400 },
    categoryGroup: "womens",
    category: "Lehenga",
    subCategory: "Non Bridal Lehenga",
    qualityScore: 80,
    processedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("recognitionPipeline", () => {
  it("hybrid weights sum to 1", () => {
    const sum = Object.values(HYBRID_WEIGHTS).reduce((a, b) => a + b, 0);
    assert.equal(sum, 1);
  });

  it("rejects cross category group matches", () => {
    const q = mockFingerprint({ categoryGroup: "womens", category: "Lehenga" });
    const s = mockFingerprint({ categoryGroup: "mens", category: "Sherwani", primaryColour: "green" });
    const result = computeHybridSimilarity(q, s, null, null);
    assert.ok(result.hybrid <= 10);
    assert.ok(shouldExcludeFromResults(result));
    assert.ok(result.rejected?.some((r) => r.includes("category_group")));
  });

  it("multi query penalises monocolor stored", () => {
    const q = mockFingerprint({
      colourFamily: "multi",
      colourHistogram: new Array(36).fill(0.05),
      primaryColour: "multi",
    });
    const s = mockFingerprint({ colourFamily: "blue", primaryColour: "blue" });
    const multi = mockFingerprint({
      colourFamily: "multi",
      colourHistogram: new Array(36).fill(0.05),
      primaryColour: "multi",
    });
    const blueScore = computeHybridSimilarity(q, s, null, null, "Blue", "BLUE CUTDANA");
    const multiScore = computeHybridSimilarity(q, multi, null, null, null, "MULTI RAJWADA");
    assert.ok(multiScore.hybrid > blueScore.hybrid);
    assert.ok(shouldExcludeFromResults(blueScore));
    assert.ok(blueScore.hybrid <= 20);
  });

  it("filters candidates by category group", () => {
    const q = mockFingerprint({ categoryGroup: "womens", category: "Lehenga", primaryColour: "green" });
    const candidates: StoredRecognitionProfile[] = [
      { itemId: 1, sku: "A", name: "A", category: "Lehenga", subCategory: null, color: null, fingerprint: mockFingerprint(), embeddings: null, identificationIndex: null },
      { itemId: 2, sku: "B", name: "B", category: "Sherwani", subCategory: null, color: null, fingerprint: mockFingerprint({ categoryGroup: "mens", category: "Sherwani" }), embeddings: null, identificationIndex: null },
    ];
    const { filtered } = filterCandidates(q, candidates);
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].itemId, 1);
  });

  it("confidence bands follow spec", () => {
    assert.equal(scoreToConfidenceBand(92), "reliable");
    assert.equal(scoreToConfidenceBand(85), "very_likely");
    assert.equal(scoreToConfidenceBand(75), "possible");
    assert.equal(scoreToConfidenceBand(60), "unreliable");
    assert.equal(CONFIDENCE_BANDS.autoSelectMin, 80);
  });
});
