import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { matchGarmentIdentity } from "./identityMatcher";
import { IDENTITY_WEIGHTS_V5 } from "./identityMatcher";
import { FINGERPRINT_MATCH_WEIGHTS } from "./constants";
import type { FeatureFingerprint } from "./types";
import { DRESS_CHECKER_FINGERPRINT_VERSION } from "./types";
import type { IdentificationIndex, QueryReferenceFingerprint } from "../dressIdentificationTypes";
import { IDENTIFICATION_INDEX_VERSION } from "../dressIdentificationTypes";

function fp(overrides: Partial<FeatureFingerprint> = {}): FeatureFingerprint {
  const hist = [
    0.12, 0.02, 0.01, 0.08, 0.03, 0.01, 0.05, 0.02, 0, 0.01, 0.04, 0.02, 0.06, 0.01, 0, 0.02,
    0.03, 0.01, 0.07, 0.02, 0.01, 0, 0.04, 0.03, 0.02, 0.01, 0.05, 0, 0.01, 0.02, 0.03, 0.01,
    0.02, 0.01, 0.03, 0.01,
  ];
  return {
    version: DRESS_CHECKER_FINGERPRINT_VERSION,
    primaryColour: "ivory",
    secondaryColour: "gold",
    accentColours: ["maroon"],
    colourHistogram: hist,
    colourFamily: "multi",
    fabricTextureDescriptor: [0.8, 0.6, 0.4],
    embroideryDensity: 72,
    embroideryStyle: "zardozi",
    stoneWork: true,
    mirrorWork: true,
    threadPattern: [0.7, 0.5],
    borderPattern: { averageHash: "88442211", differenceHash: "11224488", widthRatio: 0.22 },
    sleeveLength: "full",
    necklineShape: "round",
    silhouette: "flared",
    garmentShape: "lehenga",
    dupattaPattern: "brocade",
    dupattaBorder: "gold",
    motifDistribution: [0.6, 0.4, 0.3],
    textureFeatures: [0.5, 0.7],
    orbKeypoints: [1, 2, 3],
    localDescriptors: [0.9, 0.8, 0.7],
    garmentBounds: { left: 0, top: 0, width: 100, height: 100 },
    categoryGroup: "womens",
    category: "Lehenga",
    subCategory: "Bridal",
    qualityScore: 85,
    processedAt: new Date().toISOString(),
    ...overrides,
  };
}

function views(emb = [1, 0.1, 0.05]): QueryReferenceFingerprint[] {
  return [
    {
      source: "q0",
      embeddings: { global: emb, border: emb, blouse: emb, skirt: emb, embroidery: emb },
      texture: { averageHash: "1", differenceHash: "2", centreHash: "", bottomHash: "", topHash: "" },
      colorHistogram: fp().colourHistogram,
      colorFamily: "multi",
    },
  ];
}

function index(f: FeatureFingerprint, emb = [1, 0.1, 0.05]): IdentificationIndex {
  return {
    version: IDENTIFICATION_INDEX_VERSION,
    modelId: "Xenova/siglip-base-patch16-224",
    preprocessingVersion: 1,
    embeddingDimension: 768,
    contentHash: "t",
    indexedAt: new Date().toISOString(),
    category: "Lehenga",
    references: [
      {
        refId: "full",
        label: "full",
        embeddings: { global: emb, border: emb, blouse: emb, skirt: emb, embroidery: emb },
        texture: { averageHash: "1", differenceHash: "2", centreHash: "", bottomHash: "", topHash: "" },
        colorHistogram: f.colourHistogram,
        colorFamily: f.colourFamily,
      },
    ],
  };
}

describe("dressChecker regression v7", () => {
  it("fingerprint weights sum to 1 (GPT is separate 5% blend)", () => {
    const s = Object.values(FINGERPRINT_MATCH_WEIGHTS).reduce<number>((a, b) => a + b, 0);
    assert.ok(Math.abs(s - 1) < 0.001);
  });

  it("same fingerprint scores >= 75 (same dress baseline)", () => {
    const f = fp();
    const score = matchGarmentIdentity(views(), f, index(f), f, "MULTI RAJWADA", "Multi");
    assert.ok(score.final >= 75, `got ${score.final}`);
  });

  it("similar colour different embroidery stays below highly-likely", () => {
    const query = fp({ colourFamily: "blue", primaryColour: "blue" });
    const stored = fp({
      colourFamily: "blue",
      embroideryStyle: "plain",
      embroideryDensity: 10,
      stoneWork: false,
      mirrorWork: false,
      borderPattern: { averageHash: "9999", differenceHash: "8888", widthRatio: 0.05 },
      motifDistribution: [0.1, 0.1],
      localDescriptors: [0.1, 0.2],
    });
    const score = matchGarmentIdentity(
      views([1, 0, 0]),
      query,
      index(stored, [0.2, 0.9, 0.1]),
      stored,
      "BLUE PLAIN",
      "Blue",
    );
    assert.ok(score.final < 85, `colour-only got ${score.final}`);
  });

  it("completely different dress scores < 50", () => {
    const query = fp();
    const stored = fp({
      embroideryStyle: "plain",
      embroideryDensity: 5,
      borderPattern: { averageHash: "0000", differenceHash: "0000", widthRatio: 0.02 },
      silhouette: "fitted",
      garmentShape: "straight",
      category: "Saree",
      motifDistribution: [0, 0],
      localDescriptors: [0, 0],
    });
    const score = matchGarmentIdentity(
      views([1, 0, 0]),
      query,
      index(stored, [0, 0, 1]),
      stored,
      "OTHER",
      null,
    );
    assert.ok(score.final < 50, `different dress got ${score.final}`);
  });
});
