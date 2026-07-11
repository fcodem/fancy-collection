import type { FeatureFingerprint } from "./types";

/** Structured fine-grained features stored inside recognitionFingerprint JSON. */
export type EnterpriseFineGrainedFeatures = {
  dominantColors: string[];
  borderFeatures: { averageHash: string; differenceHash: string; widthRatio: number };
  motifFeatures: number[];
  embroideryDensity: number;
  stoneDensity: number;
  panelLayout: { silhouette: string; garmentShape: string; motifDistribution: number[] };
  blouseFeatures: { necklineShape: string; sleeveLength: string };
  dupattaFeatures: { pattern: string | null; border: string | null };
  silhouetteFeatures: { silhouette: string; garmentShape: string };
  regionEmbeddings?: {
    blouseEmbedding?: number[];
    dupattaEmbedding?: number[];
    lehengaEmbedding?: number[];
    borderEmbedding?: number[];
    embroideryEmbedding?: number[];
    globalEmbedding?: number[];
  };
};

export type FineGrainedComponentScores = {
  colorScore: number;
  borderScore: number;
  motifScore: number;
  stoneScore: number;
  panelScore: number;
  blouseScore: number;
  dupattaScore: number;
  fineGrainedScore: number;
  reasons: string[];
};

export type CategoryFineGrainedWeights = {
  color: number;
  border: number;
  motif: number;
  stone: number;
  panel: number;
  blouse: number;
  dupatta: number;
};

/** Default bridal lehenga weights (user spec). */
export const DEFAULT_FINE_GRAINED_WEIGHTS: CategoryFineGrainedWeights = {
  color: 0.1,
  border: 0.2,
  motif: 0.25,
  stone: 0.2,
  panel: 0.15,
  blouse: 0.05,
  dupatta: 0.05,
};

export function categoryFineGrainedWeights(category: string): CategoryFineGrainedWeights {
  const c = category.toLowerCase();
  if (c.includes("lehenga") && (c.includes("bridal") || c.includes("wedding"))) {
    return DEFAULT_FINE_GRAINED_WEIGHTS;
  }
  if (c.includes("lehenga")) {
    return { color: 0.12, border: 0.18, motif: 0.22, stone: 0.15, panel: 0.18, blouse: 0.08, dupatta: 0.07 };
  }
  if (c.includes("gown") || c.includes("reception")) {
    return { color: 0.1, border: 0.1, motif: 0.15, stone: 0.15, panel: 0.25, blouse: 0.15, dupatta: 0.1 };
  }
  if (c.includes("sherwani") || c.includes("jodhpuri") || c.includes("kurta")) {
    return { color: 0.08, border: 0.15, motif: 0.28, stone: 0.22, panel: 0.12, blouse: 0.1, dupatta: 0.05 };
  }
  if (c.includes("saree")) {
    return { color: 0.1, border: 0.25, motif: 0.2, stone: 0.15, panel: 0.1, blouse: 0.12, dupatta: 0.08 };
  }
  if (c.includes("jewel")) {
    return { color: 0.05, border: 0.1, motif: 0.3, stone: 0.35, panel: 0.1, blouse: 0.05, dupatta: 0.05 };
  }
  return DEFAULT_FINE_GRAINED_WEIGHTS;
}

export function featureFingerprintToFineGrained(
  fp: FeatureFingerprint,
  regionEmbeddings?: EnterpriseFineGrainedFeatures["regionEmbeddings"],
): EnterpriseFineGrainedFeatures {
  return {
    dominantColors: [fp.primaryColour, fp.secondaryColour, ...fp.accentColours].filter(Boolean),
    borderFeatures: fp.borderPattern,
    motifFeatures: fp.motifDistribution,
    embroideryDensity: fp.embroideryDensity,
    stoneDensity: fp.stoneWork ? Math.min(100, fp.embroideryDensity + 20) : fp.embroideryDensity * 0.4,
    panelLayout: {
      silhouette: fp.silhouette,
      garmentShape: fp.garmentShape,
      motifDistribution: fp.motifDistribution,
    },
    blouseFeatures: { necklineShape: fp.necklineShape, sleeveLength: fp.sleeveLength },
    dupattaFeatures: { pattern: fp.dupattaPattern, border: fp.dupattaBorder },
    silhouetteFeatures: { silhouette: fp.silhouette, garmentShape: fp.garmentShape },
    regionEmbeddings,
  };
}
