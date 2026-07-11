/**
 * View-invariant dress matching — mannequin / worn / hanger / folded / partial.
 *
 * Multi-crop embeddings + decorative-structure scoring + ORB-style keypoints.
 * GPT verify runs only after local feature matching.
 */

import type { QueryReferenceFingerprint, RegionEmbeddings } from "../dressIdentificationTypes";
import type { FeatureFingerprint } from "./types";

/** Soft-accept when global embedding is weak but decorative structure still matches. */
export const VIEWPOINT_VARIATION_THRESHOLDS = {
  /** Global embedding below this is treated as "low" (viewpoint / pose shift). */
  globalMaxForTrigger: 75,
  borderMin: 60,
  motifMin: 55,
  panelMin: 55,
} as const;

export type ViewpointVariationInput = {
  embedding: number;
  border: number;
  motif: number;
  panel: number;
};

export type LocalKeypointSignatures = {
  borderKeypoints: number[];
  motifKeypoints: number[];
  panelKeypoints: number[];
};

export type LocalKeypointMatchResult = {
  border: number;
  motif: number;
  panel: number;
  combined: number;
};

function l2Normalize(vec: number[]): number[] {
  let sumSq = 0;
  for (const v of vec) sumSq += v * v;
  const n = Math.sqrt(sumSq);
  if (!n) return vec.map(() => 0);
  return vec.map((v) => v / n);
}

function vectorCosinePercent(a: number[], b: number[]): number {
  if (!a?.length || !b?.length) return 0;
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d ? Math.round((dot / d) * 100) : 0;
}

function pushEmbedding(out: number[][], emb: number[] | undefined): void {
  if (emb && emb.length > 0) out.push(emb);
}

/** Collect region embeddings for cross-view MAX recall (PART 1). */
export function collectViewInvariantRegionVectors(embeddings: RegionEmbeddings): number[][] {
  const out: number[][] = [];
  pushEmbedding(out, embeddings.global); // full
  pushEmbedding(out, embeddings.border);
  pushEmbedding(out, embeddings.motif ?? embeddings.embroidery); // motif
  pushEmbedding(out, embeddings.blouse);
  pushEmbedding(out, embeddings.skirt); // panel
  pushEmbedding(out, embeddings.embroidery);
  pushEmbedding(out, embeddings.dupatta);
  pushEmbedding(out, embeddings.silhouette);
  return out;
}

/**
 * PART 1 recall: MAX-pool multi-crop query embeddings for pgvector ANN.
 * Element-wise max across L2-normalized region vectors (full/border/motif/blouse/panel/…),
 * then re-normalize — embeddings never dominate scoring, only recall.
 */
export function poolViewInvariantQueryEmbedding(
  queryFingerprints: QueryReferenceFingerprint[],
): number[] {
  const vectors: number[][] = [];
  for (const qv of queryFingerprints) {
    vectors.push(...collectViewInvariantRegionVectors(qv.embeddings));
  }
  if (!vectors.length) return [];

  const dim = vectors[0]!.length;
  const acc = new Array<number>(dim).fill(Number.NEGATIVE_INFINITY);
  let count = 0;
  for (const v of vectors) {
    if (v.length !== dim) continue;
    const unit = l2Normalize(v);
    for (let i = 0; i < dim; i++) {
      if (unit[i]! > acc[i]!) acc[i] = unit[i]!;
    }
    count += 1;
  }
  if (!count) return [];
  for (let i = 0; i < dim; i++) {
    if (!Number.isFinite(acc[i]!)) acc[i] = 0;
  }
  return l2Normalize(acc);
}

/**
 * Max cosine similarity across primary bridal regions (full/border/motif/blouse/panel).
 * Used for cross-view stage-1 scoring instead of a single global embedding.
 */
export function maxCrossViewEmbeddingScore(
  query: RegionEmbeddings,
  ref: RegionEmbeddings,
  cosinePercent: (a: number[] | undefined, b: number[] | undefined) => number,
): number {
  const pairs: Array<[number[] | undefined, number[] | undefined]> = [
    [query.global, ref.global],
    [query.border, ref.border],
    [query.motif ?? query.embroidery, ref.motif ?? ref.embroidery],
    [query.blouse, ref.blouse],
    [query.skirt, ref.skirt],
  ];
  let best = 0;
  for (const [a, b] of pairs) {
    const s = cosinePercent(a, b);
    if (s > best) best = s;
  }
  return best;
}

/**
 * STEP 3: global low but border/motif/panel high → possible same dress (viewpoint variation).
 */
export function isViewpointVariationMatch(input: ViewpointVariationInput): boolean {
  const t = VIEWPOINT_VARIATION_THRESHOLDS;
  return (
    input.embedding < t.globalMaxForTrigger &&
    input.border >= t.borderMin &&
    input.motif >= t.motifMin &&
    input.panel >= t.panelMin
  );
}

/**
 * STEP 4: ORB/SIFT-style local keypoints split by decorative region.
 * Uses existing fingerprint descriptors (no native OpenCV dependency).
 */
export function buildLocalKeypointSignatures(fp: FeatureFingerprint): LocalKeypointSignatures {
  const orb = fp.orbKeypoints ?? [];
  const local = fp.localDescriptors ?? [];
  const motifs = fp.motifDistribution ?? [];
  const thread = fp.threadPattern ?? [];

  const borderKeypoints = [
    ...orb.slice(0, 24),
    fp.borderPattern.widthRatio,
    ...hashToSparseVector(fp.borderPattern.averageHash, 8),
    ...hashToSparseVector(fp.borderPattern.differenceHash, 8),
  ];

  const motifKeypoints = [
    ...motifs.slice(0, 16),
    ...orb.slice(24, 48),
    ...thread.slice(0, 8),
  ];

  const panelKeypoints = [
    ...local.slice(0, 32),
    fp.garmentBounds.width,
    fp.garmentBounds.height,
    fp.garmentBounds.left,
    fp.garmentBounds.top,
  ];

  return {
    borderKeypoints: padOrTrim(borderKeypoints, 48),
    motifKeypoints: padOrTrim(motifKeypoints, 48),
    panelKeypoints: padOrTrim(panelKeypoints, 48),
  };
}

function padOrTrim(vec: number[], size: number): number[] {
  if (vec.length === size) return vec;
  if (vec.length > size) return vec.slice(0, size);
  return [...vec, ...new Array(size - vec.length).fill(0)];
}

function hashToSparseVector(hash: string, slots: number): number[] {
  const out = new Array<number>(slots).fill(0);
  if (!hash) return out;
  try {
    let n = BigInt(hash);
    const mask = BigInt(0xffff);
    for (let i = 0; i < slots; i++) {
      out[i] = Number(n & mask) / 0xffff;
      n >>= BigInt(16);
      if (n === BigInt(0)) break;
    }
  } catch {
    /* ignore malformed hash */
  }
  return out;
}

/** Match stored border / motif / panel keypoints (ORB-style cosine). */
export function matchLocalKeypoints(
  query: LocalKeypointSignatures | FeatureFingerprint,
  stored: LocalKeypointSignatures | FeatureFingerprint,
): LocalKeypointMatchResult {
  const q = isFingerprint(query) ? buildLocalKeypointSignatures(query) : query;
  const s = isFingerprint(stored) ? buildLocalKeypointSignatures(stored) : stored;

  const border = vectorCosinePercent(q.borderKeypoints, s.borderKeypoints);
  const motif = vectorCosinePercent(q.motifKeypoints, s.motifKeypoints);
  const panel = vectorCosinePercent(q.panelKeypoints, s.panelKeypoints);
  const combined = Math.round(border * 0.4 + motif * 0.35 + panel * 0.25);

  return { border, motif, panel, combined };
}

function isFingerprint(
  v: LocalKeypointSignatures | FeatureFingerprint,
): v is FeatureFingerprint {
  return "orbKeypoints" in v && "localDescriptors" in v && "borderPattern" in v;
}

/** Panel structure score for view-invariant weighting (skirt + silhouette + local layout). */
export function computePanelStructureScore(
  skirtEmb: number,
  queryFp: FeatureFingerprint,
  storedFp: FeatureFingerprint | null,
  localPanelKeypointScore?: number,
): number {
  if (!storedFp) {
    return Math.round(skirtEmb * 0.7 + (localPanelKeypointScore ?? skirtEmb) * 0.3);
  }
  const silhouetteMatch = queryFp.silhouette === storedFp.silhouette ? 90 : 40;
  const shapeMatch = queryFp.garmentShape === storedFp.garmentShape ? 88 : 45;
  const layout = vectorCosinePercent(
    queryFp.localDescriptors.slice(0, 16),
    storedFp.localDescriptors.slice(0, 16),
  );
  const kp = localPanelKeypointScore ?? layout;
  return Math.round(skirtEmb * 0.35 + silhouetteMatch * 0.15 + shapeMatch * 0.15 + layout * 0.2 + kp * 0.15);
}
