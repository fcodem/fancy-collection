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

function embPercent(a: number[], b: number[]): number {
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
  const embroidery = embPercent(qe.embroidery, re.embroidery);
  const border = embPercent(qe.border, re.border);
  const blouse = embPercent(qe.blouse, re.blouse);
  const skirt = embPercent(qe.skirt, re.skirt);

  const motifs = storedFp
    ? vectorPercent(queryFp.motifDistribution, storedFp.motifDistribution)
    : embPercent(qe.embroidery, re.embroidery);
  const texture = storedFp
    ? vectorPercent(queryFp.fabricTextureDescriptor, storedFp.fabricTextureDescriptor)
    : Math.round((embPercent(qe.border, re.border) + embPercent(qe.skirt, re.skirt)) / 2);

  const colour = storedFp
    ? histogramSimilarity(queryFp.colourHistogram, storedFp.colourHistogram)
    : histogramSimilarity(query.colorHistogram, ref.colorHistogram);

  const silhouette = storedFp
    ? Math.round(
        skirt * 0.5 +
          (queryFp.silhouette === storedFp.silhouette ? 90 : 40) * 0.25 +
          vectorPercent(queryFp.textureFeatures, storedFp.textureFeatures) * 0.25,
      )
    : skirt;
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
  const dupatta = storedFp
    ? queryFp.dupattaPattern && storedFp.dupattaPattern
      ? queryFp.dupattaPattern === storedFp.dupattaPattern
        ? 88
        : 42
      : 55
    : 50;

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

/** Production 7-component weighted final score. */
export function computeWeightedFingerprintScore(scores: {
  global: number;
  embroidery: number;
  border: number;
  motifs: number;
  colour: number;
  texture: number;
  silhouette: number;
}): number {
  const w = FINGERPRINT_MATCH_WEIGHTS;
  return Math.round(
    scores.global * w.global +
      scores.embroidery * w.embroidery +
      scores.border * w.border +
      scores.motifs * w.motifs +
      scores.colour * w.colour +
      scores.texture * w.texture +
      scores.silhouette * w.silhouette,
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

/** Stage 1 — global embedding cosine search (identity, not colour). */
export function globalEmbeddingScore(
  queryViews: QueryReferenceFingerprint[],
  references: StoredReferenceFingerprint[],
): number {
  let best = 0;
  for (const qv of queryViews) {
    for (const ref of references) {
      const g = embPercent(qv.embeddings.global, ref.embeddings.global);
      const skirt = embPercent(qv.embeddings.skirt, ref.embeddings.skirt);
      const emb = embPercent(qv.embeddings.embroidery, ref.embeddings.embroidery);
      const combined = Math.round(g * 0.5 + skirt * 0.3 + emb * 0.2);
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
