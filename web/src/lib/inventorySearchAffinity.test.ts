import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { inventoryStyleAffinity } from "./inventorySearchAffinity";
import { RECOGNITION_PIPELINE_VERSION } from "./recognitionPipeline/types";
import type { RecognitionFeatureFingerprint } from "./recognitionPipeline/types";

function mockQuery(overrides: Partial<RecognitionFeatureFingerprint> = {}): RecognitionFeatureFingerprint {
  return {
    version: RECOGNITION_PIPELINE_VERSION,
    primaryColour: "ivory",
    secondaryColour: "gold",
    accentColours: [],
    colourHistogram: new Array(36).fill(0.04),
    colourFamily: "multi",
    fabricTextureDescriptor: [],
    embroideryDensity: 14,
    embroideryStyle: "heavy",
    stoneWork: true,
    mirrorWork: false,
    threadPattern: [],
    borderPattern: { averageHash: "1", differenceHash: "2", widthRatio: 0.15 },
    sleeveLength: "full",
    necklineShape: "round",
    silhouette: "volume",
    garmentShape: "lehenga",
    dupattaPattern: null,
    dupattaBorder: null,
    motifDistribution: [],
    textureFeatures: [],
    orbKeypoints: [],
    localDescriptors: [],
    garmentBounds: { left: 0, top: 0, width: 100, height: 200 },
    categoryGroup: "womens",
    category: "Lehenga",
    subCategory: "Bridal Lehenga",
    qualityScore: 80,
    processedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("inventorySearchAffinity", () => {
  it("boosts rajwada on multi heavy embroidery uploads", () => {
    const q = mockQuery();
    assert.ok(inventoryStyleAffinity("MULTI RAJWADA", q) >= 20);
    assert.ok(inventoryStyleAffinity("FLORAL CT", q) < 0);
    assert.ok(inventoryStyleAffinity("MULTI SABESACHI", q) < 0);
  });

  it("penalizes cutdana on multi heavy embroidery uploads", () => {
    const q = mockQuery();
    assert.ok(inventoryStyleAffinity("BLUE CUTDANA 3", q) < 0);
  });
});
