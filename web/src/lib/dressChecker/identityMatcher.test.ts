import { describe, it } from "node:test";

import assert from "node:assert/strict";

import {

  matchGarmentIdentity,

  buildMatchExplanation,

} from "./identityMatcher";

import { IDENTITY_WEIGHTS_V5 } from "./identityMatcher";

import { FINGERPRINT_MATCH_WEIGHTS } from "./constants";

import type { FeatureFingerprint, IdentityScores } from "./types";

import { DRESS_CHECKER_FINGERPRINT_VERSION } from "./types";

import type { IdentificationIndex, QueryReferenceFingerprint } from "../dressIdentificationTypes";

import { IDENTIFICATION_INDEX_VERSION } from "../dressIdentificationTypes";



function baseFingerprint(overrides: Partial<FeatureFingerprint> = {}): FeatureFingerprint {

  return {

    version: DRESS_CHECKER_FINGERPRINT_VERSION,

    primaryColour: "ivory",

    secondaryColour: "gold",

    accentColours: ["maroon", "green"],

    colourHistogram: [

      0.12, 0.02, 0.01, 0.08, 0.03, 0.01, 0.05, 0.02, 0, 0.01, 0.04, 0.02, 0.06, 0.01, 0, 0.02,

      0.03, 0.01, 0.07, 0.02, 0.01, 0, 0.04, 0.03, 0.02, 0.01, 0.05, 0, 0.01, 0.02, 0.03, 0.01,

      0.02, 0.01, 0.03, 0.01,

    ],

    colourFamily: "multi",

    fabricTextureDescriptor: [0.8, 0.6, 0.4, 0.2],

    embroideryDensity: 72,

    embroideryStyle: "zardozi",

    stoneWork: true,

    mirrorWork: true,

    threadPattern: [0.7, 0.5, 0.3],

    borderPattern: { averageHash: "88442211", differenceHash: "11224488", widthRatio: 0.22 },

    sleeveLength: "full",

    necklineShape: "round",

    silhouette: "flared",

    garmentShape: "lehenga",

    dupattaPattern: "brocade",

    dupattaBorder: "gold",

    motifDistribution: [0.6, 0.4, 0.3, 0.2],

    textureFeatures: [0.5, 0.7, 0.3],

    orbKeypoints: [1, 2, 3, 4],

    localDescriptors: [0.9, 0.8, 0.7, 0.6],

    garmentBounds: { left: 0, top: 0, width: 100, height: 100 },

    categoryGroup: "womens",

    category: "Lehenga",

    subCategory: "Bridal",

    qualityScore: 85,

    processedAt: new Date().toISOString(),

    ...overrides,

  };

}



function mockQueryViews(): QueryReferenceFingerprint[] {

  const emb = [1, 0.1, 0.05];

  return [

    {

      source: "view_0_full",

      embeddings: { global: emb, border: emb, blouse: emb, skirt: emb, embroidery: emb },

      texture: { averageHash: "1", differenceHash: "2", centreHash: "", bottomHash: "", topHash: "" },

      colorHistogram: baseFingerprint().colourHistogram,

      colorFamily: "multi",

    },

  ];

}



function mockIndex(fp: FeatureFingerprint): IdentificationIndex {

  const emb = [1, 0.1, 0.05];

    return {

      version: IDENTIFICATION_INDEX_VERSION,

      modelId: "Xenova/siglip-base-patch16-224",

      preprocessingVersion: 1,

      embeddingDimension: 768,

      contentHash: "test",

      indexedAt: new Date().toISOString(),

      category: "Lehenga",

      references: [

        {

          refId: "full",

          label: "full",

          embeddings: { global: emb, border: emb, blouse: emb, skirt: emb, embroidery: emb },

        texture: { averageHash: "1", differenceHash: "2", centreHash: "", bottomHash: "", topHash: "" },

        colorHistogram: fp.colourHistogram,

        colorFamily: fp.colourFamily,

      },

        {

          refId: "embroidery",

          label: "embroidery_detail",

          embeddings: { global: emb, border: emb, blouse: emb, skirt: emb, embroidery: emb },

        texture: { averageHash: "1", differenceHash: "2", centreHash: "", bottomHash: "", topHash: "" },

        colorHistogram: fp.colourHistogram,

        colorFamily: fp.colourFamily,

      },

    ],

  };

}



describe("dressChecker identityMatcher v7", () => {

  it("fingerprint weights prioritize border and motif (bridal cross-view)", () => {
    assert.ok(IDENTITY_WEIGHTS_V5.border > IDENTITY_WEIGHTS_V5.colour);
    assert.ok(IDENTITY_WEIGHTS_V5.border > IDENTITY_WEIGHTS_V5.motifs);
    const sum = Object.values(FINGERPRINT_MATCH_WEIGHTS).reduce<number>((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1) < 0.001);
    assert.equal(FINGERPRINT_MATCH_WEIGHTS.border, 0.4);
    assert.equal(FINGERPRINT_MATCH_WEIGHTS.motifs, 0.2);
    assert.equal(FINGERPRINT_MATCH_WEIGHTS.embroidery, 0.15);
    assert.equal(FINGERPRINT_MATCH_WEIGHTS.panel, 0.1);
    assert.equal(FINGERPRINT_MATCH_WEIGHTS.global, 0.1);
    assert.equal(FINGERPRINT_MATCH_WEIGHTS.colour, 0.05);
  });



  it("identical garment scores high on identity features", () => {

    const fp = baseFingerprint();

    const identity = matchGarmentIdentity(mockQueryViews(), fp, mockIndex(fp), fp, "MULTI RAJWADA", "Multi");

    assert.ok(identity.final >= 75, `expected high identity score, got ${identity.final}`);

    assert.ok(identity.embroidery >= 70);

    assert.ok(identity.border >= 70);

  });



  it("same colour different embroidery stays below auto-recommend threshold", () => {

    const query = baseFingerprint({ colourFamily: "blue", primaryColour: "blue" });

    const stored = baseFingerprint({

      colourFamily: "blue",

      primaryColour: "blue",

      embroideryStyle: "plain",

      embroideryDensity: 12,

      stoneWork: false,

      mirrorWork: false,

      threadPattern: [0.1, 0.1],

      borderPattern: { averageHash: "9999", differenceHash: "8888", widthRatio: 0.08 },

      motifDistribution: [0.1, 0.1],

      localDescriptors: [0.1, 0.2],

    });

    const queryViews: QueryReferenceFingerprint[] = [

      {

        source: "view_0_full",

        embeddings: {

          global: [1, 0, 0],

          border: [1, 0, 0],

          blouse: [1, 0, 0],

          skirt: [1, 0, 0],

          embroidery: [1, 0, 0],

        },

        texture: { averageHash: "1", differenceHash: "2", centreHash: "", bottomHash: "", topHash: "" },

        colorHistogram: query.colourHistogram,

        colorFamily: "blue",

      },

    ];

    const mismatchedIndex = mockIndex(stored);

    const mismatchedEmb = {

      global: [0.2, 0.9, 0.1],

      border: [0.2, 0.9, 0.1],

      blouse: [0.2, 0.9, 0.1],

      skirt: [0.2, 0.9, 0.1],

      embroidery: [0.2, 0.9, 0.1],

    };

    for (const ref of mismatchedIndex.references) {

      ref.embeddings = mismatchedEmb;

    }

    const identity = matchGarmentIdentity(queryViews, query, mismatchedIndex, stored, "BLUE PLAIN", "Blue");

    assert.ok(identity.final < 90, `colour-only match should not auto-recommend: ${identity.final}`);

  });



  it("match explanation lists dominant identity features", () => {

    const fp = baseFingerprint();

    const identity = matchGarmentIdentity(mockQueryViews(), fp, mockIndex(fp), fp, "TEST", null);

    const explanation = buildMatchExplanation(identity);

    assert.ok(explanation.summary.length > 0);

    assert.equal(explanation.overall, identity.final);

  });

});


