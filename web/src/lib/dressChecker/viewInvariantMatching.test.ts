import { describe, expect, it } from "vitest";
import {
  buildBridalIdentityHashes,
  matchBridalIdentityHashes,
} from "./bridalIdentityHashes";
import {
  isViewpointVariationMatch,
  poolViewInvariantQueryEmbedding,
  maxCrossViewEmbeddingScore,
} from "./viewInvariantMatching";
import type { FeatureFingerprint } from "./types";
import type { QueryReferenceFingerprint, RegionEmbeddings } from "../dressIdentificationTypes";
import { DRESS_CHECKER_FINGERPRINT_VERSION } from "./types";

function mockEmb(seed: number, dim = 8): number[] {
  return Array.from({ length: dim }, (_, i) => Math.sin(seed + i) * 0.5 + 0.5);
}

function baseFp(overrides: Partial<FeatureFingerprint> = {}): FeatureFingerprint {
  return {
    version: DRESS_CHECKER_FINGERPRINT_VERSION,
    primaryColour: "pink",
    secondaryColour: "gold",
    accentColours: [],
    colourHistogram: [0.1, 0.2, 0.3],
    colourFamily: "pink",
    fabricTextureDescriptor: [0.5, 0.4, 0.3],
    embroideryDensity: 70,
    embroideryStyle: "zari",
    stoneWork: false,
    mirrorWork: false,
    threadPattern: [0.8, 0.7, 0.6, 0.5],
    borderPattern: { averageHash: "0xabc", differenceHash: "0xdef", widthRatio: 0.12 },
    sleeveLength: "elbow",
    necklineShape: "round",
    silhouette: "lehenga",
    garmentShape: "flared",
    dupattaPattern: null,
    dupattaBorder: null,
    motifDistribution: [0.6, 0.4, 0.3, 0.2, 0.5, 0.4, 0.3, 0.2, 0.1],
    textureFeatures: [0.2, 0.3],
    orbKeypoints: Array.from({ length: 48 }, (_, i) => (i % 7) / 7),
    localDescriptors: Array.from({ length: 32 }, (_, i) => (i % 5) / 5),
    garmentBounds: { left: 0.1, top: 0.05, width: 0.8, height: 0.9 },
    categoryGroup: "womens",
    category: "Lehenga",
    subCategory: "Bridal",
    qualityScore: 90,
    processedAt: new Date().toISOString(),
    ...overrides,
  };
}

function regionBag(seed: number): RegionEmbeddings {
  return {
    global: mockEmb(seed),
    border: mockEmb(seed + 1),
    blouse: mockEmb(seed + 2),
    skirt: mockEmb(seed + 3),
    embroidery: mockEmb(seed + 4),
    motif: mockEmb(seed + 5),
    dupatta: mockEmb(seed + 6),
    silhouette: mockEmb(seed + 7),
  };
}

describe("cross-view bridal matching", () => {
  it("soft-accepts viewpoint variation at bridal thresholds", () => {
    expect(
      isViewpointVariationMatch({
        embedding: 40,
        border: 65,
        motif: 60,
        panel: 58,
      }),
    ).toBe(true);
  });

  it("MAX-pools multi-crop query embeddings", () => {
    const qv: QueryReferenceFingerprint = {
      source: "full",
      embeddings: regionBag(1),
      texture: {
        averageHash: "1",
        differenceHash: "2",
        centreHash: "3",
        bottomHash: "4",
        topHash: "5",
      },
      colorHistogram: [0.1],
      colorFamily: "pink",
    };
    const pooled = poolViewInvariantQueryEmbedding([qv]);
    expect(pooled).toHaveLength(8);
    const norm = Math.sqrt(pooled.reduce((s, v) => s + v * v, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it("maxCrossViewEmbeddingScore prefers best region", () => {
    const a = regionBag(1);
    const b = { ...regionBag(1) };
    // Make border identical, global different
    b.global = mockEmb(99);
    const score = maxCrossViewEmbeddingScore(a, b, (x, y) => {
      if (!x?.length || !y?.length) return 0;
      let same = true;
      for (let i = 0; i < x.length; i++) if (Math.abs(x[i]! - y[i]!) > 1e-9) same = false;
      return same ? 100 : 10;
    });
    expect(score).toBe(100);
  });

  it("builds stable bridal identity hashes", () => {
    const fp = baseFp();
    const h1 = buildBridalIdentityHashes(fp);
    const h2 = buildBridalIdentityHashes(fp);
    expect(h1.bridalIdentityHash).toBe(h2.bridalIdentityHash);
    expect(h1.motifSequenceHash).toBeTruthy();
    expect(h1.panelStructureHash).toBeTruthy();
    expect(h1.borderHierarchyHash).toBeTruthy();
    const match = matchBridalIdentityHashes(h1, h2);
    expect(match.exactBridalHash).toBe(true);
    expect(match.combined).toBe(100);
  });

  it("separates near-duplicate bridal hashes when motif sequence differs", () => {
    const a = buildBridalIdentityHashes(baseFp());
    const b = buildBridalIdentityHashes(
      baseFp({
        motifDistribution: [0.1, 0.1, 0.9, 0.1, 0.1, 0.8, 0.1, 0.1, 0.7],
        borderPattern: { averageHash: "0x111", differenceHash: "0x222", widthRatio: 0.3 },
      }),
    );
    const match = matchBridalIdentityHashes(a, b);
    expect(match.exactBridalHash).toBe(false);
    expect(match.combined).toBeLessThan(90);
  });
});
