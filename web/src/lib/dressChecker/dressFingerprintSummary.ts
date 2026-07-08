/**
 * Human-readable Dress Fingerprint summary stored with each inventory item.
 * Feature version v2 — comprehensive identity record, not a single embedding.
 */
import type { FeatureFingerprint } from "./types";
import { DRESS_CHECKER_FEATURE_VERSION } from "./constants";

export type DressFingerprintSummary = {
  featureVersion: number;
  category: string;
  primaryColour: string;
  secondaryColours: string[];
  embroidery: string;
  borderPattern: string;
  skirtPanels: number | null;
  motifs: string[];
  texture: string;
  dupatta: "Present" | "Absent" | "Unknown";
  blouse: "Present" | "Absent" | "Unknown";
  shape: string;
  visualEmbeddingDim: number;
  localFeatureCount: number;
  hasBorderEmbedding: boolean;
  hasEmbroideryEmbedding: boolean;
  hasColourHistogram: boolean;
  hasTextureHistogram: boolean;
  hasPatternHistogram: boolean;
  processedAt: string;
};

function embroideryLabel(fp: FeatureFingerprint): string {
  const style = fp.embroideryStyle || "unknown";
  const density = fp.embroideryDensity;
  if (density >= 60) return `Heavy ${style}`;
  if (density >= 30) return `Medium ${style}`;
  return `Light ${style}`;
}

function textureLabel(fp: FeatureFingerprint): string {
  const avg = fp.fabricTextureDescriptor.reduce((a, b) => a + b, 0) / Math.max(fp.fabricTextureDescriptor.length, 1);
  if (avg >= 0.65) return "Dense";
  if (avg >= 0.35) return "Medium";
  return "Light";
}

function inferMotifs(fp: FeatureFingerprint): string[] {
  const motifs: string[] = [];
  if (fp.mirrorWork) motifs.push("Mirror work");
  if (fp.stoneWork) motifs.push("Stone work");
  if (fp.threadPattern.some((v) => v > 0.5)) motifs.push("Zari pattern");
  if (fp.motifDistribution.some((v) => v > 0.4)) motifs.push("Floral");
  if (fp.motifDistribution.filter((v) => v > 0.2).length >= 3) motifs.push("Multi-motif");
  if (motifs.length === 0) motifs.push("Plain");
  return motifs;
}

function skirtPanelEstimate(fp: FeatureFingerprint): number | null {
  const peaks = fp.motifDistribution.filter((v) => v > 0.15).length;
  return peaks >= 4 ? peaks * 2 : null;
}

/** Build readable Dress Fingerprint from structured feature extraction output. */
export function buildDressFingerprintSummary(
  fp: FeatureFingerprint,
  embeddingDim = 768,
): DressFingerprintSummary {
  const secondary = [fp.secondaryColour, ...fp.accentColours].filter(Boolean);
  return {
    featureVersion: DRESS_CHECKER_FEATURE_VERSION,
    category: fp.category,
    primaryColour: fp.primaryColour,
    secondaryColours: [...new Set(secondary)],
    embroidery: embroideryLabel(fp),
    borderPattern: fp.borderPattern.differenceHash || fp.borderPattern.averageHash || "unknown",
    skirtPanels: skirtPanelEstimate(fp),
    motifs: inferMotifs(fp),
    texture: textureLabel(fp),
    dupatta: fp.dupattaPattern ? "Present" : fp.category === "Lehenga" ? "Unknown" : "Absent",
    blouse: fp.category === "Lehenga" || fp.category === "Saree" ? "Present" : "Unknown",
    shape: fp.garmentShape || fp.silhouette || fp.category,
    visualEmbeddingDim: embeddingDim,
    localFeatureCount: fp.localDescriptors.length + fp.orbKeypoints.length,
    hasBorderEmbedding: !!fp.borderPattern.differenceHash,
    hasEmbroideryEmbedding: fp.embroideryDensity > 0,
    hasColourHistogram: fp.colourHistogram.length > 0,
    hasTextureHistogram: fp.textureFeatures.length > 0,
    hasPatternHistogram: fp.threadPattern.length > 0,
    processedAt: fp.processedAt,
  };
}
