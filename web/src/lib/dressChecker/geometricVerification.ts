import type { FeatureFingerprint } from "./types";
import { matchLocalKeypoints } from "./viewInvariantMatching";

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

function hashSim(a: string, b: string): number {
  if (!a || !b) return 0;
  try {
    const ba = BigInt(a);
    const bb = BigInt(b);
    let xor = ba ^ bb;
    let bits = 0;
    const one = BigInt(1);
    const z = BigInt(0);
    while (xor > z) {
      bits += Number(xor & one);
      xor >>= one;
    }
    const maxBits = Math.max(16, a.length * 4);
    return Math.round((1 - bits / maxBits) * 100);
  } catch {
    return 0;
  }
}

export type GeometricResult = {
  score: number;
  keypointAlign: number;
  borderGeometry: number;
  ornamentAlign: number;
  /** ORB-style region keypoint scores */
  borderKeypoints: number;
  motifKeypoints: number;
  panelKeypoints: number;
  passed: boolean;
  rejectReason?: string;
};

/**
 * Stage 3 — geometric + ORB/SIFT-style local feature verification.
 * Compares border_keypoints, motif_keypoints, panel_keypoints.
 */
export function verifyGeometricAlignment(
  query: FeatureFingerprint,
  stored: FeatureFingerprint,
): GeometricResult {
  const keypointAlign = vectorCosinePercent(query.localDescriptors, stored.localDescriptors);
  const ornamentAlign = vectorCosinePercent(query.orbKeypoints, stored.orbKeypoints);
  const borderAvg = Math.round(
    (hashSim(query.borderPattern.averageHash, stored.borderPattern.averageHash) +
      hashSim(query.borderPattern.differenceHash, stored.borderPattern.differenceHash)) /
      2,
  );
  const borderWidth =
    100 - Math.min(100, Math.abs(query.borderPattern.widthRatio - stored.borderPattern.widthRatio) * 120);
  const borderGeometry = Math.round(borderAvg * 0.7 + borderWidth * 0.3);

  const local = matchLocalKeypoints(query, stored);
  const embroideryAlign = vectorCosinePercent(query.threadPattern, stored.threadPattern);
  const identityOrnament = Math.round(embroideryAlign * 0.5 + ornamentAlign * 0.5);

  const score = Math.round(
    keypointAlign * 0.25 +
      ornamentAlign * 0.15 +
      borderGeometry * 0.15 +
      local.border * 0.2 +
      local.motif * 0.15 +
      local.panel * 0.1,
  );

  let passed = true;
  let rejectReason: string | undefined;

  // Soften geometry reject when decorative keypoints still align (viewpoint variation)
  const decorativeStrong = local.border >= 80 && local.motif >= 80 && local.panel >= 75;

  if (!decorativeStrong) {
    if (score < 32 && identityOrnament < 40) {
      passed = false;
      rejectReason = "Ornament/keypoint geometry mismatch";
    } else if (keypointAlign < 28 && borderGeometry < 35 && local.border < 55) {
      passed = false;
      rejectReason = "Border and embroidery landmarks do not align";
    }
  }

  return {
    score,
    keypointAlign,
    borderGeometry,
    ornamentAlign: identityOrnament,
    borderKeypoints: local.border,
    motifKeypoints: local.motif,
    panelKeypoints: local.panel,
    passed,
    rejectReason,
  };
}
