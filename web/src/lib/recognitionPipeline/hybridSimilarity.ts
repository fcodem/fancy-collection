import { cosineSimilarity, cosineToPercent } from "../siglipMath";
import {
  colorFamilyMatchScore,
  colorMatchScore,
  designSimilarity,
  fingerprintFromStored,
  histogramIndicatesMulti,
  hueCentroidSimilarity,
  multicolorPanelOverlap,
  warmCoolHueMismatchPenalty,
  type ImageFingerprint,
} from "../photoHash";
import type { RegionEmbeddings } from "../dressIdentificationTypes";
import type { HybridComponentScores, RecognitionFeatureFingerprint } from "./types";
import { HYBRID_WEIGHTS, COLOUR_MISMATCH_HEAVY_PENALTY_THRESHOLD } from "./constants";
import {
  isInventoryMonocolor,
  isInventoryMultiColor,
  resolveInventoryColourFamily,
} from "../inventoryColourSemantics";

function histToFp(hist: number[], family: string): ImageFingerprint {
  return {
    averageHash: BigInt(0),
    differenceHash: BigInt(0),
    colorHistogram: hist,
    colorFamily: family as ImageFingerprint["colorFamily"],
  };
}

function vectorSimilarity(a: number[], b: number[]): number {
  if (!a.length || !b.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom ? Math.round((dot / denom) * 100) : 0;
}

function hashSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  try {
    const ba = BigInt(a);
    const bb = BigInt(b);
    let xor = ba ^ bb;
    let bits = 0;
    const zero = BigInt(0);
    const one = BigInt(1);
    while (xor > zero) {
      bits += Number(xor & one);
      xor >>= one;
    }
    const maxBits = Math.max(a.length * 4, 16);
    return Math.round((1 - bits / maxBits) * 100);
  } catch {
    return 0;
  }
}

function embroiderySimilarity(q: RecognitionFeatureFingerprint, s: RecognitionFeatureFingerprint): number {
  const density = 100 - Math.min(100, Math.abs(q.embroideryDensity - s.embroideryDensity) * 3);
  const style = q.embroideryStyle === s.embroideryStyle ? 100 : 55;
  const thread = vectorSimilarity(q.threadPattern, s.threadPattern);
  const stones = q.stoneWork === s.stoneWork ? 15 : 0;
  const mirror = q.mirrorWork === s.mirrorWork ? 15 : 0;
  return Math.min(100, Math.round(density * 0.4 + style * 0.25 + thread * 0.2 + stones + mirror));
}

function visualSimilarity(qEmb: RegionEmbeddings | null, sEmb: RegionEmbeddings | null): number {
  if (!qEmb || !sEmb) return 0;
  const global = cosineToPercent(cosineSimilarity(qEmb.global, sEmb.global));
  const border = cosineToPercent(cosineSimilarity(qEmb.border, sEmb.border));
  const emb = cosineToPercent(cosineSimilarity(qEmb.embroidery, sEmb.embroidery));
  return Math.round(global * 0.55 + border * 0.25 + emb * 0.2);
}

/** True when a match must never appear in user-facing top results. */
export function shouldExcludeFromResults(scores: HybridComponentScores): boolean {
  const flags = scores.rejected ?? [];
  if (flags.some((f) => f.includes("category_group") || f.includes("category_mismatch"))) return true;
  if (
    flags.some(
      (f) =>
        f.includes("colour_family") ||
        f.includes("monocolor") ||
        f.includes("colour_distance"),
    )
  ) {
    return true;
  }
  return scores.colour < COLOUR_MISMATCH_HEAVY_PENALTY_THRESHOLD && scores.hybrid < 30;
}

export function computeHybridSimilarity(
  query: RecognitionFeatureFingerprint,
  stored: RecognitionFeatureFingerprint,
  queryEmb: RegionEmbeddings | null,
  storedEmb: RegionEmbeddings | null,
  inventoryColor?: string | null,
  inventoryName?: string | null,
): HybridComponentScores {
  const penalties: string[] = [];

  if (query.categoryGroup !== stored.categoryGroup) {
    penalties.push(`category_group_mismatch:${query.categoryGroup}≠${stored.categoryGroup}`);
    return {
      visual: 0,
      colour: 0,
      embroidery: 0,
      border: 0,
      silhouette: 0,
      sleeve: 0,
      neckline: 0,
      hybrid: 4,
      rejected: penalties,
    };
  }

  const storedFamily = resolveInventoryColourFamily(
    inventoryName || "",
    stored.colourFamily,
    stored.colourHistogram,
    inventoryColor,
  );
  const qMulti =
    query.colourFamily === "multi" || histogramIndicatesMulti(query.colourHistogram);
  const sMulti = isInventoryMultiColor(inventoryName || "", storedFamily, stored.colourHistogram, inventoryColor);
  const bothMulti = qMulti && sMulti;

  let colour = colorMatchScore(
    histToFp(query.colourHistogram, qMulti ? "multi" : query.colourFamily),
    histToFp(stored.colourHistogram, sMulti ? "multi" : storedFamily),
  );
  if (bothMulti) {
    colour = Math.round(
      multicolorPanelOverlap(query.colourHistogram, stored.colourHistogram) * 0.5 +
        hueCentroidSimilarity(query.colourHistogram, stored.colourHistogram) * 0.35 +
        colour * 0.15,
    );
  }
  const familyScore = colorFamilyMatchScore(
    qMulti ? "multi" : query.colourFamily,
    sMulti ? "multi" : storedFamily,
  );

  if (query.category && stored.category && query.category !== stored.category) {
    if (!qMulti && !sMulti) {
      penalties.push(`category_mismatch:${query.category}≠${stored.category}`);
    }
  }

  const visual = visualSimilarity(queryEmb, storedEmb);
  const embroidery = embroiderySimilarity(query, stored);
  const border = Math.round(
    hashSimilarity(query.borderPattern.averageHash, stored.borderPattern.averageHash) * 0.6 +
      hashSimilarity(query.borderPattern.differenceHash, stored.borderPattern.differenceHash) * 0.4,
  );
  const silhouette =
    query.silhouette === stored.silhouette ? 95 : query.garmentShape === stored.garmentShape ? 75 : 45;
  const sleeve = query.sleeveLength === stored.sleeveLength ? 95 : 50;
  const neckline = query.necklineShape === stored.necklineShape ? 95 : 50;
  const motif = vectorSimilarity(query.motifDistribution, stored.motifDistribution);

  let metadataBoost = 0;
  if (inventoryColor) {
    const text = inventoryColor.toLowerCase();
    if (text.includes(query.primaryColour) || text.includes(query.colourFamily)) metadataBoost = 3;
  }
  if (stored.subCategory && query.subCategory === stored.subCategory) metadataBoost += 2;

  const weights = bothMulti
    ? { visual: 0.34, colour: 0.28, embroidery: 0.14, border: 0.05, silhouette: 0.08, sleeve: 0.05, neckline: 0.06 }
    : HYBRID_WEIGHTS;

  let hybrid = Math.min(
    100,
    Math.round(
      visual * weights.visual +
        colour * weights.colour +
        embroidery * weights.embroidery +
        border * weights.border +
        silhouette * weights.silhouette +
        sleeve * weights.sleeve +
        neckline * weights.neckline +
        metadataBoost +
        (bothMulti ? motif * 0.08 : 0),
    ),
  );

  if (bothMulti && visual >= 80) {
    hybrid = Math.round(visual * 0.38 + hybrid * 0.62);
    hybrid = Math.max(0, hybrid - warmCoolHueMismatchPenalty(query.colourHistogram, stored.colourHistogram));
  } else if (bothMulti) {
    const panel = multicolorPanelOverlap(query.colourHistogram, stored.colourHistogram);
    hybrid = Math.min(100, Math.round(hybrid + Math.max(0, panel - 55) * 0.15));
    hybrid = Math.max(0, hybrid - warmCoolHueMismatchPenalty(query.colourHistogram, stored.colourHistogram));
  }

  // Soft penalties — never hard-zero; spec requires heavy reduction, not rejection.
  if (familyScore === 0) {
    penalties.push("colour_family_mismatch");
    hybrid = Math.min(hybrid, 12);
  }
  if (qMulti && isInventoryMonocolor(inventoryName || "", storedFamily, stored.colourHistogram, inventoryColor)) {
    penalties.push("multi_upload_vs_monocolor_dress");
    hybrid = Math.min(hybrid, 14);
  }
  if (colour < COLOUR_MISMATCH_HEAVY_PENALTY_THRESHOLD) {
    penalties.push(`colour_distance_high:${colour}%`);
    hybrid = Math.min(hybrid, Math.round(hybrid * 0.22 + colour * 0.12));
  }
  if (penalties.some((p) => p.includes("category_mismatch"))) {
    hybrid = Math.min(hybrid, 18);
  }

  return { visual, colour, embroidery, border, silhouette, sleeve, neckline, hybrid, rejected: penalties };
}

export function hybridToRankReason(scores: HybridComponentScores): string {
  if (scores.rejected?.length) {
    const colourPenalty = scores.rejected.find(
      (r) => r.includes("colour") || r.includes("monocolor"),
    );
    if (colourPenalty) return `Colour mismatch — score heavily reduced (${scores.colour}% palette match)`;
  }
  const parts: string[] = [];
  if (scores.visual >= 75) parts.push(`overall visual match ${scores.visual}%`);
  if (scores.colour >= 65) parts.push(`colour palette ${scores.colour}%`);
  if (scores.embroidery >= 65) parts.push(`embroidery detail ${scores.embroidery}%`);
  if (scores.border >= 65) parts.push(`border pattern ${scores.border}%`);
  if (scores.silhouette >= 70) parts.push(`silhouette ${scores.silhouette}%`);
  return parts.length ? parts.join("; ") : "Highest hybrid identification score";
}

export function textureFromFingerprint(fp: RecognitionFeatureFingerprint) {
  const fpA = fingerprintFromStored(
    { averageHash: "0", differenceHash: "0" },
    fp.colourHistogram,
    fp.colourFamily,
  );
  return fpA;
}

export function textureSimilarityBetween(
  q: RecognitionFeatureFingerprint,
  s: RecognitionFeatureFingerprint,
): number {
  const a = fingerprintFromStored(
    { averageHash: q.borderPattern.averageHash, differenceHash: q.borderPattern.differenceHash },
    q.colourHistogram,
    q.colourFamily,
  );
  const b = fingerprintFromStored(
    { averageHash: s.borderPattern.averageHash, differenceHash: s.borderPattern.differenceHash },
    s.colourHistogram,
    s.colourFamily,
  );
  return designSimilarity(a, b);
}
