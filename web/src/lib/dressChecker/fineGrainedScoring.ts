import { histogramSimilarity } from "../photoHash";
import type { FeatureFingerprint } from "./types";
import {
  categoryFineGrainedWeights,
  type CategoryFineGrainedWeights,
  type EnterpriseFineGrainedFeatures,
  type FineGrainedComponentScores,
} from "./fineGrainedTypes";

function vectorPercent(a: number[], b: number[]): number {
  if (!a?.length || !b?.length) return 0;
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d ? Math.round((dot / d) * 100) : 0;
}

function hashSim(a: string, b: string): number {
  if (!a || !b) return 0;
  try {
    const ba = BigInt(a.startsWith("0x") ? a : `0x${a}`);
    const bb = BigInt(b.startsWith("0x") ? b : `0x${b}`);
    let xor = ba ^ bb;
    let bits = 0;
    const one = BigInt(1);
    const z = BigInt(0);
    while (xor > z) {
      bits += Number(xor & one);
      xor >>= one;
    }
    const maxBits = Math.max(ba.toString(2).length, bb.toString(2).length, 1);
    return Math.max(0, Math.round((1 - bits / maxBits) * 100));
  } catch {
    return 0;
  }
}

function borderScore(q: FeatureFingerprint, inv: FeatureFingerprint): number {
  const ah = hashSim(q.borderPattern.averageHash, inv.borderPattern.averageHash);
  const dh = hashSim(q.borderPattern.differenceHash, inv.borderPattern.differenceHash);
  const width = Math.round(
    (1 - Math.min(1, Math.abs(q.borderPattern.widthRatio - inv.borderPattern.widthRatio) * 4)) * 100,
  );
  return Math.round(ah * 0.4 + dh * 0.45 + width * 0.15);
}

function stoneScore(q: FeatureFingerprint, inv: FeatureFingerprint): number {
  const density = 100 - Math.min(100, Math.abs(q.embroideryDensity - inv.embroideryDensity));
  const stoneMatch =
    q.stoneWork === inv.stoneWork ? 90 : q.stoneWork || inv.stoneWork ? 35 : 70;
  const mirror = q.mirrorWork === inv.mirrorWork ? 85 : 50;
  const thread = vectorPercent(q.threadPattern, inv.threadPattern);
  return Math.round(density * 0.35 + stoneMatch * 0.35 + mirror * 0.1 + thread * 0.2);
}

function panelScore(q: FeatureFingerprint, inv: FeatureFingerprint): number {
  const motif = vectorPercent(q.motifDistribution, inv.motifDistribution);
  const shape = q.garmentShape === inv.garmentShape ? 88 : 42;
  const sil = q.silhouette === inv.silhouette ? 85 : 40;
  const tex = vectorPercent(q.textureFeatures, inv.textureFeatures);
  return Math.round(motif * 0.45 + shape * 0.2 + sil * 0.15 + tex * 0.2);
}

function blouseScore(q: FeatureFingerprint, inv: FeatureFingerprint): number {
  const neck = q.necklineShape === inv.necklineShape ? 92 : 38;
  const sleeve = q.sleeveLength === inv.sleeveLength ? 90 : 40;
  const local = vectorPercent(q.localDescriptors.slice(0, 12), inv.localDescriptors.slice(0, 12));
  return Math.round(neck * 0.35 + sleeve * 0.3 + local * 0.35);
}

function dupattaScore(q: FeatureFingerprint, inv: FeatureFingerprint): number {
  if (!q.dupattaPattern && !inv.dupattaPattern) return 60;
  const pat =
    q.dupattaPattern && inv.dupattaPattern
      ? q.dupattaPattern === inv.dupattaPattern
        ? 90
        : 38
      : 45;
  const bor =
    q.dupattaBorder && inv.dupattaBorder
      ? q.dupattaBorder === inv.dupattaBorder
        ? 88
        : 40
      : 50;
  return Math.round(pat * 0.6 + bor * 0.4);
}

export function compareFineGrainedFingerprints(
  query: FeatureFingerprint,
  inventory: FeatureFingerprint,
  category = query.category || inventory.category,
): FineGrainedComponentScores {
  const weights = categoryFineGrainedWeights(category);
  const colorScore = histogramSimilarity(query.colourHistogram, inventory.colourHistogram);
  const borderScoreVal = borderScore(query, inventory);
  const motifScore = vectorPercent(query.motifDistribution, inventory.motifDistribution);
  const stoneScoreVal = stoneScore(query, inventory);
  const panelScoreVal = panelScore(query, inventory);
  const blouseScoreVal = blouseScore(query, inventory);
  const dupattaScoreVal = dupattaScore(query, inventory);

  const fineGrainedScore = weightedFineGrainedScore(
    {
      color: colorScore,
      border: borderScoreVal,
      motif: motifScore,
      stone: stoneScoreVal,
      panel: panelScoreVal,
      blouse: blouseScoreVal,
      dupatta: dupattaScoreVal,
    },
    weights,
  );

  const reasons: string[] = [];
  if (borderScoreVal >= 75) reasons.push(`Border match ${borderScoreVal}%`);
  if (motifScore >= 70) reasons.push(`Motif layout ${motifScore}%`);
  if (stoneScoreVal >= 70) reasons.push(`Stone/embroidery density ${stoneScoreVal}%`);
  if (panelScoreVal >= 70) reasons.push(`Panel/silhouette ${panelScoreVal}%`);
  if (colorScore >= 85) reasons.push(`Similar colour palette ${colorScore}% (not sufficient alone)`);
  if (colorScore >= 80 && fineGrainedScore < 75) {
    reasons.push("Same colour family — verify motifs and border before identifying");
  }
  if (fineGrainedScore < 50) reasons.push("Distinct garment — different physical dress likely");

  return {
    colorScore,
    borderScore: borderScoreVal,
    motifScore,
    stoneScore: stoneScoreVal,
    panelScore: panelScoreVal,
    blouseScore: blouseScoreVal,
    dupattaScore: dupattaScoreVal,
    fineGrainedScore,
    reasons,
  };
}

export function weightedFineGrainedScore(
  scores: {
    color: number;
    border: number;
    motif: number;
    stone: number;
    panel: number;
    blouse: number;
    dupatta: number;
  },
  weights: CategoryFineGrainedWeights,
): number {
  return Math.round(
    scores.color * weights.color +
      scores.border * weights.border +
      scores.motif * weights.motif +
      scores.stone * weights.stone +
      scores.panel * weights.panel +
      scores.blouse * weights.blouse +
      scores.dupatta * weights.dupatta,
  );
}

export function parseFineGrainedFromStored(raw: unknown): EnterpriseFineGrainedFeatures | null {
  if (!raw || typeof raw !== "object") return null;
  const fg = (raw as { fineGrained?: EnterpriseFineGrainedFeatures }).fineGrained;
  return fg && typeof fg === "object" ? fg : null;
}
