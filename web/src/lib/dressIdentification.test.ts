import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  metadataColorAlignment,
  scoreReferencePair,
  scoreItemAgainstQueries,
  explainRankReason,
} from "./dressIdentificationScoring";
import { detectCategory } from "./services/dressIdentificationPipeline";
import { IDENTIFICATION_WEIGHTS, IDENTIFICATION_RELIABLE_THRESHOLD } from "./dressIdentificationTypes";
import type { QueryReferenceFingerprint, StoredReferenceFingerprint } from "./dressIdentificationTypes";

function mockEmbedding(seed: number): number[] {
  const vec = new Array(768).fill(0).map((_, i) => Math.sin(seed + i * 0.01));
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

function mockQuery(seed: number, family: "green" | "blue" | "multi" = "green"): QueryReferenceFingerprint {
  const emb = mockEmbedding(seed);
  return {
    source: "test",
    embeddings: {
      global: emb,
      border: mockEmbedding(seed + 1),
      blouse: mockEmbedding(seed + 2),
      skirt: mockEmbedding(seed + 3),
      embroidery: mockEmbedding(seed + 4),
    },
    texture: {
      averageHash: "12345",
      differenceHash: "67890",
      centreHash: "111",
      bottomHash: "222",
      topHash: "333",
    },
    colorHistogram: new Array(36).fill(family === "multi" ? 0.05 : 0),
    colorFamily: family,
  };
}

function mockStored(seed: number, refId: string, family: "green" | "blue" | "multi" = "green"): StoredReferenceFingerprint {
  const emb = mockEmbedding(seed);
  return {
    refId,
    label: refId,
    embeddings: {
      global: emb,
      border: mockEmbedding(seed + 1),
      blouse: mockEmbedding(seed + 2),
      skirt: mockEmbedding(seed + 3),
      embroidery: mockEmbedding(seed + 4),
    },
    texture: {
      averageHash: "12345",
      differenceHash: "67890",
      centreHash: "111",
      bottomHash: "222",
      topHash: "333",
    },
    colorHistogram: new Array(36).fill(family === "multi" ? 0.05 : 0),
    colorFamily: family,
  };
}

describe("dressIdentificationScoring", () => {
  it("weights sum to 1.0 for core components", () => {
    const sum =
      IDENTIFICATION_WEIGHTS.global +
      IDENTIFICATION_WEIGHTS.border +
      IDENTIFICATION_WEIGHTS.embroidery +
      IDENTIFICATION_WEIGHTS.texture +
      IDENTIFICATION_WEIGHTS.color;
    assert.equal(sum, 1);
  });

  it("same seed embeddings score higher than different seeds", () => {
    const query = mockQuery(1, "green");
    const same = mockStored(1, "full", "green");
    const different = mockStored(99, "full", "blue");
    const sameScore = scoreReferencePair(query, same, "Pista Green");
    const diffScore = scoreReferencePair(query, different, "Royal Blue");
    assert.ok(sameScore.weighted > diffScore.weighted);
  });

  it("metadata colour alignment boosts matching inventory colour", () => {
    assert.ok(metadataColorAlignment("Pista Green", "green") > metadataColorAlignment("Royal Blue", "green"));
  });

  it("picks best reference across multiple views", () => {
    const query = mockQuery(5, "green");
    const refs = [mockStored(50, "weak", "green"), mockStored(5, "strong", "green")];
    const result = scoreItemAgainstQueries([query], refs, "Green");
    assert.equal(result.bestRefId, "strong");
    assert.ok(result.finalScore >= 50);
  });

  it("multi-colour query ranks multi inventory above monocolor border lookalikes", () => {
    const query = mockQuery(10, "multi");
    const multiRajwada = mockStored(10, "multi-rajwada", "multi");
    const blueCutdana = mockStored(10, "blue-cutdana", "blue");
    blueCutdana.embeddings.border = mockEmbedding(10.5);
    const multiScore = scoreReferencePair(query, multiRajwada, null, "MULTI RAJWADA");
    const blueScore = scoreReferencePair(query, blueCutdana, "Blue", "BLUE CUTDANA");
    assert.ok(
      multiScore.weighted > blueScore.weighted,
      `expected multi ${multiScore.weighted}% > blue ${blueScore.weighted}%`,
    );
    assert.ok(blueScore.weighted <= 20, `blue should be capped, got ${blueScore.weighted}%`);
  });

  it("metadata colour alignment boosts multi in dress name", () => {
    assert.ok(
      metadataColorAlignment(null, "multi", "MULTI RAJWADA") >
        metadataColorAlignment(null, "multi"),
    );
  });

  it("explainRankReason mentions strong global match", () => {
    const reason = explainRankReason(
      {
        global: 90,
        border: 50,
        blouse: 50,
        skirt: 50,
        embroidery: 50,
        texture: 50,
        color: 50,
        metadataColor: 50,
        weighted: 85,
      },
      "Lehenga",
    );
    assert.match(reason, /overall visual match/);
  });
});

describe("detectCategory", () => {
  it("detects category with highest average prototype similarity", () => {
    const queries = [mockQuery(10, "green")];
    const items = [
      {
        category: "Lehenga",
        index: {
          version: 3 as const,
          modelId: "Xenova/siglip-base-patch16-224",
          preprocessingVersion: 1,
          embeddingDimension: 768,
          contentHash: "x",
          indexedAt: "t",
          category: "Lehenga",
          references: [mockStored(10, "full")],
        },
      },
      {
        category: "Sherwani",
        index: {
          version: 3 as const,
          modelId: "Xenova/siglip-base-patch16-224",
          preprocessingVersion: 1,
          embeddingDimension: 768,
          contentHash: "y",
          indexedAt: "t",
          category: "Sherwani",
          references: [mockStored(80, "full")],
        },
      },
    ];
    const result = detectCategory(queries, items);
    assert.equal(result.category, "Lehenga");
    assert.ok(result.confidence > 0);
  });
});

describe("identification thresholds", () => {
  it("reliable identification requires 90%", () => {
    assert.equal(IDENTIFICATION_RELIABLE_THRESHOLD, 90);
  });
});
