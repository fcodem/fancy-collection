/**
 * Deterministic bridal fingerprints + motif layout (peacock / elephant / arches / etc.).
 * These dominate ranking for near-duplicate discrimination before GPT.
 */

import { createHash } from "crypto";
import type { FeatureFingerprint } from "./types";

export type MotifKind =
  | "paisley"
  | "peacock"
  | "elephant"
  | "floral_vines"
  | "arches"
  | "mandala"
  | "swan"
  | "figure_border"
  | "unknown";

export type MotifDetection = {
  kind: MotifKind;
  count: number;
  /** Normalized positions in garment space 0–1 */
  positions: Array<{ x: number; y: number; strength: number }>;
  confidence: number;
};

export type BridalIdentityHashes = {
  bridalIdentityHash: string;
  /** Aliases / required fingerprints */
  panelSequenceHash: string;
  borderFingerprint: string;
  motifFingerprint: string;
  peacockFingerprint: string;
  elephantFingerprint: string;
  mirrorFingerprint: string;
  stoneDensityFingerprint: string;
  /** Legacy names kept for callers */
  motifSequenceHash: string;
  panelStructureHash: string;
  borderHierarchyHash: string;
  panelCount: number;
  motifPeaks: number;
  borderWidthBucket: number;
  stoneDensityBucket: number;
  peacockSignal: number;
  elephantSignal: number;
  mirrorSignal: number;
  detections: MotifDetection[];
};

function quantize(values: number[], bins = 8): number[] {
  return values.map((v) => {
    if (!Number.isFinite(v)) return 0;
    const clamped = Math.max(0, Math.min(1, v > 1 ? v / 100 : v));
    return Math.round(clamped * (bins - 1));
  });
}

function hashParts(parts: Array<string | number>): string {
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 24);
}

function estimatePanelCount(fp: FeatureFingerprint): number {
  const peaks = fp.motifDistribution.filter((v) => v > 0.18).length;
  const layout = fp.localDescriptors.filter((v) => Math.abs(v) > 0.15).length;
  return Math.max(1, Math.min(12, Math.round(peaks * 0.6 + layout * 0.15 + 2)));
}

/**
 * Heuristic motif layout from fingerprint grids.
 * Maps energy peaks → peacock / elephant / arches / paisley / floral / mandala / figure border.
 */
export function detectBridalMotifs(fp: FeatureFingerprint): MotifDetection[] {
  const m = fp.motifDistribution.length
    ? fp.motifDistribution
    : [0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2];
  const cols = 3;
  const rows = Math.max(1, Math.ceil(m.length / cols));
  const detections: MotifDetection[] = [];

  const peakAt = (i: number) => {
    const x = (i % cols) / Math.max(1, cols - 1);
    const y = Math.floor(i / cols) / Math.max(1, rows - 1);
    return { x, y, strength: m[i] ?? 0 };
  };

  const midBand = m.slice(3, 6);
  const midAvg = midBand.reduce((a, b) => a + b, 0) / Math.max(1, midBand.length);
  const edge =
    (m[0] ?? 0) + (m[2] ?? 0) + (m[6] ?? 0) + (m[m.length - 1] ?? 0);
  const centre = m[4] ?? midAvg;
  const lower = m.slice(-3).reduce((a, b) => a + b, 0) / 3;
  const thread =
    fp.threadPattern.reduce((a, b) => a + b, 0) / Math.max(1, fp.threadPattern.length);

  // Peacock — mid/upper body vertical energy + high thread
  if (midAvg > 0.28 || (centre > 0.35 && thread > 0.4)) {
    const positions = midBand
      .map((_, i) => peakAt(3 + i))
      .filter((p) => p.strength > 0.2);
    detections.push({
      kind: "peacock",
      count: Math.max(1, positions.length),
      positions,
      confidence: Math.round(Math.min(100, midAvg * 120 + thread * 40)),
    });
  }

  // Elephant — hem / border energy + wide border
  if (edge / 4 > 0.25 || (fp.borderPattern.widthRatio > 0.15 && lower > 0.3)) {
    detections.push({
      kind: "elephant",
      count: Math.max(1, Math.round(edge)),
      positions: [0, 2, 6, 8]
        .filter((i) => (m[i] ?? 0) > 0.15)
        .map(peakAt),
      confidence: Math.round(
        Math.min(100, (edge / 4) * 100 + fp.borderPattern.widthRatio * 180),
      ),
    });
  }

  // Arches — mid-lower repeating peaks
  const archPeaks = m.filter((v, i) => i >= 3 && i <= 7 && v > 0.22).length;
  if (archPeaks >= 2) {
    detections.push({
      kind: "arches",
      count: archPeaks,
      positions: m
        .map((v, i) => ({ v, i }))
        .filter((x) => x.i >= 3 && x.i <= 7 && x.v > 0.22)
        .map((x) => peakAt(x.i)),
      confidence: Math.round(Math.min(100, archPeaks * 28)),
    });
  }

  // Paisley / floral vines — scattered mid energy
  const scatter = m.filter((v) => v > 0.15 && v < 0.45).length;
  if (scatter >= 4) {
    detections.push({
      kind: scatter >= 6 ? "floral_vines" : "paisley",
      count: scatter,
      positions: m.map((v, i) => ({ v, i })).filter((x) => x.v > 0.15).map((x) => peakAt(x.i)),
      confidence: Math.round(Math.min(100, scatter * 14)),
    });
  }

  // Mandala — strong centre
  if (centre > 0.45) {
    detections.push({
      kind: "mandala",
      count: 1,
      positions: [peakAt(4)],
      confidence: Math.round(Math.min(100, centre * 140)),
    });
  }

  // Figure / dancer border — very wide border + lower band energy
  if (fp.borderPattern.widthRatio > 0.18 && lower > 0.25) {
    detections.push({
      kind: "figure_border",
      count: Math.max(3, Math.round(lower * 8)),
      positions: m.slice(-3).map((_, i) => peakAt(m.length - 3 + i)),
      confidence: Math.round(Math.min(100, lower * 100 + fp.borderPattern.widthRatio * 100)),
    });
  }

  // Swan heuristic — paired mid-left energy (twin peaks)
  if ((m[3] ?? 0) > 0.3 && (m[5] ?? 0) > 0.25 && Math.abs((m[3] ?? 0) - (m[5] ?? 0)) < 0.15) {
    detections.push({
      kind: "swan",
      count: 2,
      positions: [peakAt(3), peakAt(5)],
      confidence: Math.round(Math.min(100, ((m[3] ?? 0) + (m[5] ?? 0)) * 80)),
    });
  }

  if (!detections.length) {
    detections.push({
      kind: "unknown",
      count: 0,
      positions: [],
      confidence: 0,
    });
  }

  return detections;
}

function detectionFingerprint(kind: MotifKind, detections: MotifDetection[]): string {
  const d = detections.find((x) => x.kind === kind);
  if (!d || d.confidence < 35) return hashParts([kind, "absent"]);
  return hashParts([
    kind,
    d.count,
    d.confidence,
    ...d.positions.flatMap((p) => [
      Math.round(p.x * 10),
      Math.round(p.y * 10),
      Math.round(p.strength * 10),
    ]),
  ]);
}

/** Build bridal identity hashes from a feature fingerprint (pre-GPT). */
export function buildBridalIdentityHashes(fp: FeatureFingerprint): BridalIdentityHashes {
  const motifQ = quantize(fp.motifDistribution.slice(0, 12), 10);
  const localQ = quantize(fp.localDescriptors.slice(0, 16), 8);
  const detections = detectBridalMotifs(fp);
  const peacock = detections.find((d) => d.kind === "peacock");
  const elephant = detections.find((d) => d.kind === "elephant");
  const panelCount = estimatePanelCount(fp);
  const motifPeaks = fp.motifDistribution.filter((v) => v > 0.2).length;
  const borderWidthBucket = Math.round(fp.borderPattern.widthRatio * 20);
  const stoneDensityBucket = Math.round(
    (fp.stoneWork ? fp.embroideryDensity + 15 : fp.embroideryDensity * 0.5) / 10,
  );
  const peacockSignal = peacock?.confidence ?? 0;
  const elephantSignal = elephant?.confidence ?? 0;
  const mirrorSignal = fp.mirrorWork ? Math.min(100, fp.embroideryDensity + 25) : 0;

  const panelSequenceHash = hashParts([
    "panelSeq",
    panelCount,
    fp.silhouette,
    fp.garmentShape,
    ...localQ,
    ...motifQ.slice(0, 6),
  ]);

  const borderFingerprint = hashParts([
    "borderFp",
    fp.borderPattern.averageHash,
    fp.borderPattern.differenceHash,
    borderWidthBucket,
    elephantSignal > 55 ? "elephant-border" : "std-border",
    detections.some((d) => d.kind === "figure_border") ? "figure-hem" : "no-figure",
  ]);

  const motifFingerprint = hashParts([
    "motifFp",
    ...motifQ,
    ...detections.map((d) => `${d.kind}:${d.count}:${Math.round(d.confidence / 10)}`),
  ]);

  const peacockFingerprint = detectionFingerprint("peacock", detections);
  const elephantFingerprint = detectionFingerprint("elephant", detections);
  const mirrorFingerprint = hashParts([
    "mirror",
    fp.mirrorWork ? 1 : 0,
    mirrorSignal,
    stoneDensityBucket,
  ]);
  const stoneDensityFingerprint = hashParts([
    "stone",
    fp.stoneWork ? 1 : 0,
    stoneDensityBucket,
    Math.round(fp.embroideryDensity / 5),
  ]);

  const bridalIdentityHash = hashParts([
    "bridal",
    panelSequenceHash,
    borderFingerprint,
    motifFingerprint,
    peacockFingerprint,
    elephantFingerprint,
    mirrorFingerprint,
    stoneDensityFingerprint,
  ]);

  return {
    bridalIdentityHash,
    panelSequenceHash,
    borderFingerprint,
    motifFingerprint,
    peacockFingerprint,
    elephantFingerprint,
    mirrorFingerprint,
    stoneDensityFingerprint,
    motifSequenceHash: motifFingerprint,
    panelStructureHash: panelSequenceHash,
    borderHierarchyHash: borderFingerprint,
    panelCount,
    motifPeaks,
    borderWidthBucket,
    stoneDensityBucket,
    peacockSignal,
    elephantSignal,
    mirrorSignal,
    detections,
  };
}

export type BridalHashMatchResult = {
  motifSequence: number;
  panelStructure: number;
  borderHierarchy: number;
  bridalIdentity: number;
  peacock: number;
  elephant: number;
  combined: number;
  exactBridalHash: boolean;
};

function hashEqualityScore(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 100;
  let shared = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] === b[i]) shared += 1;
    else break;
  }
  return Math.round((shared / Math.max(a.length, 1)) * 70);
}

function bucketSim(a: number, b: number, scale: number): number {
  return Math.max(0, 100 - Math.abs(a - b) * scale);
}

function layoutSim(
  a: MotifDetection | undefined,
  b: MotifDetection | undefined,
): number {
  if (!a || !b) return a || b ? 20 : 55;
  const countSim = bucketSim(a.count, b.count, 20);
  const confSim = bucketSim(a.confidence, b.confidence, 0.6);
  let posSim = 50;
  if (a.positions.length && b.positions.length) {
    const n = Math.min(a.positions.length, b.positions.length);
    let acc = 0;
    for (let i = 0; i < n; i++) {
      const dx = Math.abs(a.positions[i]!.x - b.positions[i]!.x);
      const dy = Math.abs(a.positions[i]!.y - b.positions[i]!.y);
      acc += Math.max(0, 100 - (dx + dy) * 80);
    }
    posSim = Math.round(acc / n);
  }
  return Math.round(countSim * 0.3 + confSim * 0.3 + posSim * 0.4);
}

/** Compare bridal hashes — motif layout dominates near-duplicate ranking. */
export function matchBridalIdentityHashes(
  query: BridalIdentityHashes,
  stored: BridalIdentityHashes,
): BridalHashMatchResult {
  const motifSequence = Math.round(
    hashEqualityScore(query.motifFingerprint, stored.motifFingerprint) * 0.55 +
      bucketSim(query.motifPeaks, stored.motifPeaks, 12) * 0.15 +
      layoutSim(
        query.detections.find((d) => d.kind === "peacock"),
        stored.detections.find((d) => d.kind === "peacock"),
      ) *
        0.15 +
      layoutSim(
        query.detections.find((d) => d.kind === "arches"),
        stored.detections.find((d) => d.kind === "arches"),
      ) *
        0.15,
  );
  const panelStructure = Math.round(
    hashEqualityScore(query.panelSequenceHash, stored.panelSequenceHash) * 0.65 +
      bucketSim(query.panelCount, stored.panelCount, 18) * 0.35,
  );
  const borderHierarchy = Math.round(
    hashEqualityScore(query.borderFingerprint, stored.borderFingerprint) * 0.7 +
      bucketSim(query.borderWidthBucket, stored.borderWidthBucket, 15) * 0.15 +
      layoutSim(
        query.detections.find((d) => d.kind === "elephant"),
        stored.detections.find((d) => d.kind === "elephant"),
      ) *
        0.15,
  );
  const peacock = layoutSim(
    query.detections.find((d) => d.kind === "peacock"),
    stored.detections.find((d) => d.kind === "peacock"),
  );
  const elephant = layoutSim(
    query.detections.find((d) => d.kind === "elephant"),
    stored.detections.find((d) => d.kind === "elephant"),
  );
  const bridalIdentity = hashEqualityScore(query.bridalIdentityHash, stored.bridalIdentityHash);
  const combined = Math.round(
    borderHierarchy * 0.35 +
      motifSequence * 0.25 +
      panelStructure * 0.15 +
      peacock * 0.1 +
      elephant * 0.1 +
      bridalIdentity * 0.05,
  );

  return {
    motifSequence,
    panelStructure,
    borderHierarchy,
    bridalIdentity,
    peacock,
    elephant,
    combined,
    exactBridalHash: query.bridalIdentityHash === stored.bridalIdentityHash,
  };
}
