import { describe, expect, it } from "vitest";
import {
  computeEnterpriseMatchScore,
  enterpriseMatchBand,
  isBridalOverrideMatch,
  ENTERPRISE_MATCH_WEIGHTS,
  ENTERPRISE_GPT_WEIGHT,
  BRIDAL_OVERRIDE_THRESHOLDS,
} from "./enterpriseMatchScore";
import { detectQueryType, scoreWithQueryTypeWeights } from "./queryTypeDetection";
import { buildBridalIdentityHashes, detectBridalMotifs } from "./bridalIdentityHashes";
import { DRESS_CHECKER_FINGERPRINT_VERSION, type FeatureFingerprint } from "./types";

describe("enterprise cross-view bridal upgrade", () => {
  it("uses PHASE 7 weights 40/20/15/10/10/5", () => {
    const visual = Object.values(ENTERPRISE_MATCH_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(Math.abs(visual - 1)).toBeLessThan(0.001);
    expect(ENTERPRISE_GPT_WEIGHT).toBe(0.25);
    expect(ENTERPRISE_MATCH_WEIGHTS.border).toBe(0.4);
    expect(ENTERPRISE_MATCH_WEIGHTS.motif).toBe(0.2);
    expect(ENTERPRISE_MATCH_WEIGHTS.embroidery).toBe(0.15);
    expect(ENTERPRISE_MATCH_WEIGHTS.panel).toBe(0.1);
    expect(ENTERPRISE_MATCH_WEIGHTS.embedding).toBe(0.1);
    expect(ENTERPRISE_MATCH_WEIGHTS.colour).toBe(0.05);
  });

  it("does not hard-reject on colour family alone (lighting-safe)", () => {
    const r = computeEnterpriseMatchScore({
      embedding: 50,
      embroidery: 80,
      border: 85,
      colour: 40,
      motif: 80,
      panel: 75,
      dominantColorMismatch: true,
    });
    expect(r.rejected).toBe(false);
  });

  it("LOWER_SKIRT weights prioritize border/motif over silhouette", () => {
    const score = scoreWithQueryTypeWeights(
      { border: 90, motif: 85, embroidery: 70, panel: 40, embedding: 40, colour: 50 },
      "LOWER_SKIRT",
    );
    expect(score).toBeGreaterThanOrEqual(70);
  });

  it("bridal override floors at 85", () => {
    expect(
      isBridalOverrideMatch({ border: 70, motif: 60, identity: 85, colour: 50 }),
    ).toBe(true);
    const r = computeEnterpriseMatchScore({
      embedding: 30,
      embroidery: 88,
      border: 90,
      colour: 55,
      motif: 88,
      panel: 85,
    });
    expect(r.bridalOverride).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(BRIDAL_OVERRIDE_THRESHOLDS.minimumFinalScore);
  });

  it("builds peacock/elephant fingerprints", () => {
    const fp: FeatureFingerprint = {
      version: DRESS_CHECKER_FINGERPRINT_VERSION,
      primaryColour: "multi",
      secondaryColour: "gold",
      accentColours: [],
      colourHistogram: [0.1],
      colourFamily: "multi",
      fabricTextureDescriptor: [0.5],
      embroideryDensity: 75,
      embroideryStyle: "zari",
      stoneWork: true,
      mirrorWork: true,
      threadPattern: [0.8, 0.7, 0.6],
      borderPattern: { averageHash: "0xabc", differenceHash: "0xdef", widthRatio: 0.22 },
      sleeveLength: "full",
      necklineShape: "v",
      silhouette: "flared",
      garmentShape: "lehenga",
      dupattaPattern: null,
      dupattaBorder: null,
      motifDistribution: [0.2, 0.3, 0.2, 0.5, 0.55, 0.45, 0.35, 0.4, 0.5],
      textureFeatures: [0.2],
      orbKeypoints: Array.from({ length: 32 }, (_, i) => i / 32),
      localDescriptors: Array.from({ length: 32 }, (_, i) => i / 32),
      garmentBounds: { left: 0, top: 0, width: 1, height: 1 },
      categoryGroup: "womens",
      category: "Lehenga",
      subCategory: "Bridal",
      qualityScore: 90,
      processedAt: new Date().toISOString(),
    };
    const detections = detectBridalMotifs(fp);
    expect(detections.some((d) => d.kind === "peacock" || d.kind === "arches")).toBe(true);
    const hashes = buildBridalIdentityHashes(fp);
    expect(hashes.panelSequenceHash).toBeTruthy();
    expect(hashes.borderFingerprint).toBeTruthy();
    expect(hashes.peacockFingerprint).toBeTruthy();
    expect(hashes.elephantFingerprint).toBeTruthy();
    expect(hashes.mirrorFingerprint).toBeTruthy();
    expect(hashes.stoneDensityFingerprint).toBeTruthy();
  });

  it("confidence bands 95/85/70", () => {
    expect(enterpriseMatchBand(96)).toBe("exact_match");
    expect(enterpriseMatchBand(90)).toBe("highly_likely");
    expect(enterpriseMatchBand(72)).toBe("possible_match");
  });

  it("does not hard-reject onion-like colour=16.7 with strong structure", () => {
    const r = computeEnterpriseMatchScore({
      embedding: 96,
      embroidery: 80,
      border: 65,
      colour: 16.7,
      motif: 88,
      panel: 90,
      identity: 74,
    });
    expect(r.rejected).toBe(false);
  });
});
