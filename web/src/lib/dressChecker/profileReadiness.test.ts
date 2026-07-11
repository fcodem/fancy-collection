import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateProfileReadiness } from "./profileReadiness";

describe("evaluateProfileReadiness", () => {
  it("requires embedding, colour, signatures, index, and versions for READY", () => {
    const result = evaluateProfileReadiness(
      {
        itemId: 1,
        dominantColor: "dusty pink",
        secondaryColor: "pink",
        colourAnalysis: { family: "pink" },
        recognitionFingerprint: { colourFamily: "pink" },
        embroiderySignature: { style: "heavy", density: 40 },
        borderSignature: { averageHash: "a", differenceHash: "b", widthRatio: 0.1 },
        motifSignature: { distribution: [0.1] },
        textureSignature: { fabricDescriptor: [0.1], textureFeatures: [0.1] },
        panelSignature: { silhouette: "balanced", garmentShape: "standard" },
        stoneSignature: { stoneWork: false },
        garmentAttributes: {
          identificationIndex: { references: [{ refId: "full" }], contentHash: "abc" },
        },
        pipelineVersion: "9",
        recognitionVersion: 9,
        matchingVersion: 9,
      },
      { hasEmbeddingVector: true },
    );
    assert.equal(result.ready, true);
    assert.equal(result.aiStatus, "READY");
  });

  it("fails when colour family missing", () => {
    const result = evaluateProfileReadiness(
      {
        itemId: 2,
        dominantColor: "dusty pink",
        secondaryColor: null,
        colourAnalysis: {},
        recognitionFingerprint: {},
        embroiderySignature: { style: "heavy" },
        borderSignature: { averageHash: "a" },
        motifSignature: { distribution: [] },
        textureSignature: { fabricDescriptor: [] },
        panelSignature: { silhouette: "balanced" },
        stoneSignature: { stoneWork: false },
        garmentAttributes: { identificationIndex: { references: [{ refId: "full" }] } },
        pipelineVersion: "9",
        recognitionVersion: 9,
        matchingVersion: 9,
      },
      { hasEmbeddingVector: true },
    );
    assert.equal(result.ready, false);
    assert.ok(result.reasons.some((r) => r.includes("colour_family")));
  });

  it("marks STALE when versions lag", () => {
    const result = evaluateProfileReadiness(
      {
        itemId: 3,
        dominantColor: null,
        secondaryColor: null,
        colourAnalysis: null,
        recognitionFingerprint: null,
        embroiderySignature: null,
        borderSignature: null,
        motifSignature: null,
        textureSignature: null,
        panelSignature: null,
        stoneSignature: null,
        garmentAttributes: null,
        pipelineVersion: "7",
        recognitionVersion: 7,
        matchingVersion: 7,
      },
      { hasEmbeddingVector: false },
    );
    assert.equal(result.ready, false);
    assert.equal(result.aiStatus, "STALE");
  });
});
