import { cosineSimilarity, cosineToPercent } from "./siglipMath";
import {
  colorMatchScore,
  colorFamilyMatchScore,
  designSimilarity,
  fingerprintFromStored,
  histogramIndicatesMulti,
  hueCentroidSimilarity,
  multicolorPanelOverlap,
  warmCoolHueMismatchPenalty,
  type FabricColorFamily,
  type ImageFingerprint,
} from "./photoHash";
import {
  isInventoryMonocolor,
  isInventoryMultiColor,
  resolveInventoryColourFamily,
} from "./inventoryColourSemantics";
import {
  IDENTIFICATION_WEIGHTS,
  type ComponentScores,
  type StoredReferenceFingerprint,
  type QueryReferenceFingerprint,
} from "./dressIdentificationTypes";

function textureSimilarity(
  query: QueryReferenceFingerprint,
  stored: StoredReferenceFingerprint,
): number {
  const fpA = fingerprintFromStored(
    { averageHash: query.texture.averageHash, differenceHash: query.texture.differenceHash },
    query.colorHistogram,
    query.colorFamily,
  );
  const fpB = fingerprintFromStored(
    { averageHash: stored.texture.averageHash, differenceHash: stored.texture.differenceHash },
    stored.colorHistogram,
    stored.colorFamily,
  );
  if (query.texture.centreHash && stored.texture.centreHash) {
    fpA.centreHash = {
      averageHash: BigInt(query.texture.centreHash),
      differenceHash: BigInt(query.texture.centreHash),
    };
    fpB.centreHash = {
      averageHash: BigInt(stored.texture.centreHash),
      differenceHash: BigInt(stored.texture.centreHash),
    };
  }
  if (query.texture.bottomHash && stored.texture.bottomHash) {
    fpA.bottomHash = {
      averageHash: BigInt(query.texture.bottomHash),
      differenceHash: BigInt(query.texture.bottomHash),
    };
    fpB.bottomHash = {
      averageHash: BigInt(stored.texture.bottomHash),
      differenceHash: BigInt(stored.texture.bottomHash),
    };
  }
  if (query.texture.topHash && stored.texture.topHash) {
    fpA.topHash = {
      averageHash: BigInt(query.texture.topHash),
      differenceHash: BigInt(query.texture.topHash),
    };
    fpB.topHash = {
      averageHash: BigInt(stored.texture.topHash),
      differenceHash: BigInt(stored.texture.topHash),
    };
  }
  return designSimilarity(fpA, fpB);
}

function embeddingPercent(a: number[], b: number[]): number {
  if (!a.length || !b.length) return 0;
  return cosineToPercent(cosineSimilarity(a, b));
}

function colorPercent(
  queryHist: number[],
  queryFamily: FabricColorFamily,
  storedHist: number[],
  storedFamily: FabricColorFamily,
): number {
  const queryFp: ImageFingerprint = {
    averageHash: BigInt(0),
    differenceHash: BigInt(0),
    colorHistogram: queryHist,
    colorFamily: queryFamily,
  };
  const storedFp: ImageFingerprint = {
    averageHash: BigInt(0),
    differenceHash: BigInt(0),
    colorHistogram: storedHist,
    colorFamily: storedFamily,
  };
  return colorMatchScore(queryFp, storedFp);
}

/** Soft metadata colour alignment — never hard-filters candidates. */
export function metadataColorAlignment(
  inventoryColor: string | null | undefined,
  queryFamily: FabricColorFamily,
  inventoryName?: string | null,
): number {
  const name = (inventoryName || "").toLowerCase();
  if (
    queryFamily === "multi" &&
    (name.includes("multi") || name.includes("rajwada") || name.includes("panel"))
  ) {
    return 92;
  }
  if (!inventoryColor?.trim()) return 55;
  const text = inventoryColor.toLowerCase();
  const familyWords: Record<FabricColorFamily, string[]> = {
    green: ["green", "pista", "mehndi", "olive", "mint", "sage"],
    blue: ["blue", "navy", "teal", "peacock", "indigo"],
    red: ["red", "maroon", "wine", "burgundy"],
    pink: ["pink", "rose", "blush", "magenta"],
    yellow: ["yellow", "gold", "mustard", "amber"],
    multi: ["multi", "multicolor", "rainbow", "panel"],
    neutral: ["white", "ivory", "cream", "beige", "silver", "grey", "gray", "black"],
    unknown: [],
  };
  const words = familyWords[queryFamily] || [];
  if (words.some((w) => text.includes(w))) return 92;
  if (queryFamily === "unknown") return 55;
  if (queryFamily === "multi" && (text.includes("multi") || text.includes("/"))) return 85;
  return 42;
}

function queryIsMultiColor(query: QueryReferenceFingerprint): boolean {
  return query.colorFamily === "multi" || histogramIndicatesMulti(query.colorHistogram);
}

function effectiveStoredFamily(
  stored: StoredReferenceFingerprint,
  inventoryName?: string | null,
  inventoryColor?: string | null,
): FabricColorFamily {
  return resolveInventoryColourFamily(
    inventoryName || "",
    stored.colorFamily,
    stored.colorHistogram,
    inventoryColor,
  );
}

function storedIsMultiColor(
  stored: StoredReferenceFingerprint,
  inventoryName?: string | null,
  inventoryColor?: string | null,
): boolean {
  return isInventoryMultiColor(
    inventoryName || "",
    effectiveStoredFamily(stored, inventoryName, inventoryColor),
    stored.colorHistogram,
    inventoryColor,
  );
}

/**
 * Penalise monocolor inventory when the upload is clearly a panelled multi-colour dress.
 * Mirrors the gating in photoHash.finalPhotoSearchScore.
 */
function applyColorFamilyGate(
  weighted: number,
  query: QueryReferenceFingerprint,
  stored: StoredReferenceFingerprint,
  inventoryName?: string | null,
  inventoryColor?: string | null,
): number {
  const queryMulti = queryIsMultiColor(query);
  const storedMulti = storedIsMultiColor(stored, inventoryName, inventoryColor);
  const effectiveQuery: FabricColorFamily = queryMulti ? "multi" : query.colorFamily;
  const effectiveStored: FabricColorFamily = storedMulti
    ? "multi"
    : effectiveStoredFamily(stored, inventoryName, inventoryColor);

  const familyScore = colorFamilyMatchScore(effectiveQuery, effectiveStored);
  if (familyScore === 0) {
    return Math.min(12, Math.round(weighted * 0.08));
  }
  if (queryMulti && !storedMulti) {
    return Math.min(20, Math.round(weighted * 0.25));
  }
  return weighted;
}

export function scoreReferencePair(
  query: QueryReferenceFingerprint,
  stored: StoredReferenceFingerprint,
  inventoryColor?: string | null,
  inventoryName?: string | null,
): ComponentScores {
  const emb = query.embeddings;
  const ref = stored.embeddings;

  const global = embeddingPercent(emb.global, ref.global);
  const border = embeddingPercent(emb.border, ref.border);
  const blouse = embeddingPercent(emb.blouse, ref.blouse);
  const skirt = embeddingPercent(emb.skirt, ref.skirt);
  const embroidery = embeddingPercent(emb.embroidery, ref.embroidery);
  const texture = textureSimilarity(query, stored);
  const queryMulti = queryIsMultiColor(query);
  const storedMulti = storedIsMultiColor(stored, inventoryName, inventoryColor);
  const bothMulti = queryMulti && storedMulti;

  const visualGlobal = bothMulti
    ? Math.round(global * 0.3 + skirt * 0.45 + blouse * 0.25)
    : global;

  let color = colorPercent(
    query.colorHistogram,
    query.colorFamily,
    stored.colorHistogram,
    stored.colorFamily,
  );
  if (bothMulti) {
    const panel = multicolorPanelOverlap(query.colorHistogram, stored.colorHistogram);
    const hue = hueCentroidSimilarity(query.colorHistogram, stored.colorHistogram);
    color = Math.round(panel * 0.5 + hue * 0.35 + color * 0.15);
  }
  const metadataColor = metadataColorAlignment(inventoryColor, query.colorFamily, inventoryName);

  const embroideryBlend = Math.round(embroidery * 0.6 + blouse * 0.2 + skirt * 0.2);

  const weights = bothMulti
    ? { global: 0.62, border: 0.04, embroidery: 0.14, texture: 0.1, color: 0.1 }
    : {
        global: IDENTIFICATION_WEIGHTS.global,
        border: IDENTIFICATION_WEIGHTS.border,
        embroidery: IDENTIFICATION_WEIGHTS.embroidery,
        texture: IDENTIFICATION_WEIGHTS.texture,
        color: IDENTIFICATION_WEIGHTS.color,
      };

  let weighted = Math.round(
    visualGlobal * weights.global +
      border * weights.border +
      embroideryBlend * weights.embroidery +
      texture * weights.texture +
      color * weights.color +
      metadataColor * 0.03,
  );
  if (bothMulti) {
    weighted = Math.round(visualGlobal * 0.58 + weighted * 0.42);
    const huePenalty = warmCoolHueMismatchPenalty(query.colorHistogram, stored.colorHistogram);
    weighted = Math.max(0, weighted - huePenalty);
    const panel = multicolorPanelOverlap(query.colorHistogram, stored.colorHistogram);
    if (panel >= 55) weighted = Math.min(100, weighted + 3);
  }
  weighted = applyColorFamilyGate(Math.min(100, weighted), query, stored, inventoryName, inventoryColor);

  return {
    global: visualGlobal,
    border,
    blouse,
    skirt,
    embroidery,
    texture,
    color,
    metadataColor,
    weighted,
  };
}

export function explainRankReason(components: ComponentScores, category: string): string {
  const parts: string[] = [];
  if (components.global >= 82) parts.push(`overall visual match ${components.global}%`);
  if (components.border >= 78) parts.push(`border pattern ${components.border}%`);
  if (components.embroidery >= 75) parts.push(`embroidery detail ${components.embroidery}%`);
  if (components.texture >= 70) parts.push(`texture signature ${components.texture}%`);
  if (components.color >= 65) parts.push(`colour palette ${components.color}%`);
  if (components.metadataColor >= 85) parts.push("inventory colour metadata aligns");
  if (!parts.length) {
    return `Highest weighted identification score among ${category || "all"} candidates`;
  }
  return parts.join("; ");
}

export function scoreItemAgainstQueries(
  queries: QueryReferenceFingerprint[],
  references: StoredReferenceFingerprint[],
  inventoryColor?: string | null,
  inventoryName?: string | null,
): {
  finalScore: number;
  components: ComponentScores;
  bestRefId: string;
  bestRefLabel: string;
  bestQuerySource: string;
} {
  let best = {
    finalScore: 0,
    components: emptyComponents(),
    bestRefId: "",
    bestRefLabel: "",
    bestQuerySource: "",
  };

  for (const query of queries) {
    for (const ref of references) {
      const components = scoreReferencePair(query, ref, inventoryColor, inventoryName);
      if (components.weighted > best.finalScore) {
        best = {
          finalScore: components.weighted,
          components,
          bestRefId: ref.refId,
          bestRefLabel: ref.label,
          bestQuerySource: query.source,
        };
      }
    }
  }

  return best;
}

function emptyComponents(): ComponentScores {
  return {
    global: 0,
    border: 0,
    blouse: 0,
    skirt: 0,
    embroidery: 0,
    texture: 0,
    color: 0,
    metadataColor: 0,
    weighted: 0,
  };
}
