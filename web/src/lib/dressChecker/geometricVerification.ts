import type { FeatureFingerprint } from "./types";

function vectorCosinePercent(a: number[], b: number[]): number {
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
  passed: boolean;
  rejectReason?: string;
};

/**
 * Stage 3 — geometric verification of embroidery/border ornament placement.
 * Key embroidery locations must align; otherwise candidate is rejected.
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

  const score = Math.round(keypointAlign * 0.45 + ornamentAlign * 0.3 + borderGeometry * 0.25);

  const embroideryAlign = vectorCosinePercent(query.threadPattern, stored.threadPattern);
  const identityOrnament = Math.round(embroideryAlign * 0.5 + ornamentAlign * 0.5);

  let passed = true;
  let rejectReason: string | undefined;

  if (score < 32 && identityOrnament < 40) {
    passed = false;
    rejectReason = "Ornament/keypoint geometry mismatch";
  } else if (keypointAlign < 28 && borderGeometry < 35) {
    passed = false;
    rejectReason = "Border and embroidery landmarks do not align";
  }

  return { score, keypointAlign, borderGeometry, ornamentAlign: identityOrnament, passed, rejectReason };
}
