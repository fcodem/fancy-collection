import { cosineSimilarity, cosineToPercent } from "../siglipMath";
import { histogramSimilarity } from "../photoHash";
import type {
  QueryReferenceFingerprint,
  RegionEmbeddings,
  StoredReferenceFingerprint,
} from "../dressIdentificationTypes";
import type { FeatureFingerprint } from "./types";
import type { PartialViewType } from "./partialViewDetection";
import { FINGERPRINT_MATCH_WEIGHTS, PARTIAL_REGION_WEIGHTS_V6 } from "./constants";
import { computePanelStructureScore, maxCrossViewEmbeddingScore } from "./viewInvariantMatching";

export type RegionMatchResult = {
  global: number;
  embroidery: number;
  border: number;
  blouse: number;
  skirt: number;
  texture: number;
  motifs: number;
  colour: number;
  silhouette: number;
  neckline: number;
  sleeve: number;
  dupatta: number;
  regional: number;
  bestRefId: string;
  bestRefLabel: string;
  bestQuerySource: string;
};

function embPercent(a: number[] | undefined, b: number[] | undefined): number {
  if (!a?.length || !b?.length) return 0;
  return cosineToPercent(cosineSimilarity(a, b));
}

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

function hashBorderSim(a: string, b: string): number {
  if (!a || !b) return 0;
  try {
    const ba = BigInt(a.startsWith("0x") ? a : a);
    const bb = BigInt(b.startsWith("0x") ? b : b);
    let xor = ba ^ bb;
    let bits = 0;
    const one = BigInt(1);
    const z = BigInt(0);
    while (xor > z) {
      bits += Number(xor & one);
      xor >>= one;
    }
    const maxBits = Math.max(16, Math.max(a.length, b.length) * 4);
    return Math.round((1 - bits / maxBits) * 100);
  } catch {
    return a === b ? 100 : 0;
  }
}

function scorePair(
  query: QueryReferenceFingerprint,
  ref: StoredReferenceFingerprint,
  storedFp: FeatureFingerprint | null,
  queryFp: FeatureFingerprint,
  partial: PartialViewType,
): Omit<RegionMatchResult, "bestRefId" | "bestRefLabel" | "bestQuerySource"> {
  const qe = query.embeddings;
  const re = ref.embeddings;

  const global = embPercent(qe.global, re.global);
  const borderEmb = embPercent(qe.border, re.border);
  const blouse = embPercent(qe.blouse, re.blouse);
  const skirt = embPercent(qe.skirt, re.skirt);
  const embroideryEmb = embPercent(qe.embroidery, re.embroidery);
  const motifEmb = embPercent(qe.motif ?? qe.embroidery, re.motif ?? re.embroidery);

  const borderFp = storedFp
    ? Math.round(
        ((hashBorderSim(queryFp.borderPattern.averageHash, storedFp.borderPattern.averageHash) +
          hashBorderSim(
            queryFp.borderPattern.differenceHash,
            storedFp.borderPattern.differenceHash,
          )) /
          2) *
          0.75 +
          (100 -
            Math.min(
              100,
              Math.abs(queryFp.borderPattern.widthRatio - storedFp.borderPattern.widthRatio) * 200,
            )) *
            0.25,
      )
    : borderEmb;
  const border = storedFp ? Math.round(borderFp * 0.8 + borderEmb * 0.2) : borderEmb;

  const embroideryFp = storedFp
    ? Math.round(
        (100 -
          Math.min(100, Math.abs(queryFp.embroideryDensity - storedFp.embroideryDensity) * 1.2)) *
          0.55 +
          (queryFp.embroideryStyle === storedFp.embroideryStyle ? 95 : 35) * 0.25 +
          vectorPercent(queryFp.threadPattern, storedFp.threadPattern) * 0.2,
      )
    : embroideryEmb;
  const embroidery = storedFp
    ? Math.round(embroideryFp * 0.85 + embroideryEmb * 0.15)
    : embroideryEmb;

  const motifsDist = storedFp
    ? vectorPercent(queryFp.motifDistribution, storedFp.motifDistribution)
    : motifEmb;
  const motifs = storedFp
    ? Math.round(motifsDist * 0.85 + motifEmb * 0.15)
    : Math.round(motifsDist * 0.55 + motifEmb * 0.45);

  const texture = storedFp
    ? vectorPercent(queryFp.fabricTextureDescriptor, storedFp.fabricTextureDescriptor)
    : Math.round((border + skirt) / 2);

  const colour = storedFp
    ? histogramSimilarity(queryFp.colourHistogram, storedFp.colourHistogram)
    : histogramSimilarity(query.colorHistogram, ref.colorHistogram);

  const dupattaEmb = embPercent(qe.dupatta, re.dupatta);
  const silhouetteEmb = embPercent(qe.silhouette ?? qe.global, re.silhouette ?? re.global);

  const silhouette = Math.round(
    computePanelStructureScore(skirt, queryFp, storedFp) * 0.75 + silhouetteEmb * 0.25,
  );
  const neckline = storedFp
    ? queryFp.necklineShape === storedFp.necklineShape
      ? 92
      : vectorPercent(queryFp.localDescriptors.slice(0, 8), storedFp.localDescriptors.slice(0, 8))
    : blouse;
  const sleeve = storedFp
    ? queryFp.sleeveLength === storedFp.sleeveLength
      ? 90
      : vectorPercent(queryFp.localDescriptors.slice(8, 16), storedFp.localDescriptors.slice(8, 16))
    : blouse;
  // Never penalize dupatta placement differences across views
  const dupatta = Math.round(
    Math.max(
      70,
      dupattaEmb || 70,
      storedFp && queryFp.dupattaPattern && storedFp.dupattaPattern
        ? queryFp.dupattaPattern === storedFp.dupattaPattern
          ? 88
          : 72
        : 72,
    ),
  );

  const weights =
    partial !== "full" && partial in PARTIAL_REGION_WEIGHTS_V6
      ? PARTIAL_REGION_WEIGHTS_V6[partial as keyof typeof PARTIAL_REGION_WEIGHTS_V6]
      : null;

  const regional = weights
    ? Math.round(
        embroidery * weights.embroidery +
          border * weights.border +
          motifs * weights.motifs +
          skirt * weights.skirt +
          blouse * weights.blouse +
          neckline * weights.neckline +
          sleeve * weights.sleeve +
          dupatta * weights.dupatta +
          texture * weights.texture +
          global * weights.global,
      )
    : computeWeightedFingerprintScore({
        global,
        embroidery,
        border,
        motifs,
        colour,
        texture,
        silhouette,
      });

  return {
    global,
    embroidery,
    border,
    blouse,
    skirt,
    texture,
    motifs,
    colour,
    silhouette,
    neckline,
    sleeve,
    dupatta,
    regional,
  };
}

/** Bridal visual weighted score: 40/20/15/10/10/5 border/motif/embroidery/panel/embedding/colour. */
export function computeWeightedFingerprintScore(scores: {
  global: number;
  embroidery: number;
  border: number;
  motifs: number;
  colour: number;
  texture: number;
  silhouette: number;
}): number {
  return Math.round(
    scores.border * 0.4 +
      scores.motifs * 0.2 +
      scores.embroidery * 0.15 +
      scores.silhouette * 0.1 +
      scores.global * 0.1 +
      scores.colour * 0.05,
  );
}

/** Best region embedding match across all query×inventory view pairs (cosine only). */
export function matchRegionEmbeddings(
  queryViews: QueryReferenceFingerprint[],
  references: StoredReferenceFingerprint[],
  queryFp: FeatureFingerprint,
  storedFp: FeatureFingerprint | null,
  partial: PartialViewType,
): RegionMatchResult {
  let best: RegionMatchResult = {
    global: 0,
    embroidery: 0,
    border: 0,
    blouse: 0,
    skirt: 0,
    texture: 0,
    motifs: 0,
    colour: 0,
    silhouette: 0,
    neckline: 0,
    sleeve: 0,
    dupatta: 0,
    regional: 0,
    bestRefId: "",
    bestRefLabel: "",
    bestQuerySource: "",
  };

  for (const qv of queryViews) {
    for (const ref of references) {
      const scores = scorePair(qv, ref, storedFp, queryFp, partial);
      if (scores.regional > best.regional) {
        best = {
          ...scores,
          bestRefId: ref.refId,
          bestRefLabel: ref.label,
          bestQuerySource: qv.source,
        };
      }
    }
  }
  return best;
}

/** Stage 1 — MAX across full/border/motif/blouse/panel (cross-view recall score). */
export function globalEmbeddingScore(
  queryViews: QueryReferenceFingerprint[],
  references: StoredReferenceFingerprint[],
): number {
  let best = 0;
  for (const qv of queryViews) {
    for (const ref of references) {
      const combined = maxCrossViewEmbeddingScore(qv.embeddings, ref.embeddings, embPercent);
      if (combined > best) best = combined;
    }
  }
  return best;
}

/** Max cosine across views for a single region. */
export function bestRegionScore(
  queryViews: QueryReferenceFingerprint[],
  references: StoredReferenceFingerprint[],
  region: keyof RegionEmbeddings,
): number {
  let best = 0;
  for (const qv of queryViews) {
    for (const ref of references) {
      const s = embPercent(qv.embeddings[region], ref.embeddings[region]);
      if (s > best) best = s;
    }
  }
  return best;
}
