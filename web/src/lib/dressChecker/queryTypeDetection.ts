/**
 * Enterprise query-type detection for cross-view bridal matching.
 * Routes region weights so LOWER_SKIRT / BORDER_ONLY do not over-use silhouette.
 */

import type { FeatureFingerprint, ProcessedGarment } from "./types";
import type { QueryReferenceFingerprint } from "../dressIdentificationTypes";
import type { PartialViewType } from "./partialViewDetection";

export type DressQueryType =
  | "FULL_DRESS"
  | "LOWER_SKIRT"
  | "BORDER_ONLY"
  | "BLOUSE_ONLY"
  | "CUSTOMER_WEARING"
  | "MANNEQUIN"
  | "HANGER"
  | "FOLDED"
  | "EMBROIDERY_CLOSEUP"
  | "DUPATTA"
  | "DUPATTA_ONLY"
  | "MULTIPLE_DRESSES"
  | "PARTIAL_VIEW"
  | "LOW_LIGHT"
  | "BLURRY"
  | "WHATSAPP_SCREENSHOT";

/** Adaptive visual weights per query type (sum ≈ 1). Silhouette never dominates. */
export type QueryTypeWeights = {
  border: number;
  motif: number;
  embroidery: number;
  panel: number;
  embedding: number;
  colour: number;
  /** Silhouette / full-body shape — kept low for partial views */
  silhouette: number;
};

export const QUERY_TYPE_WEIGHTS: Record<DressQueryType, QueryTypeWeights> = {
  FULL_DRESS: {
    border: 0.22,
    motif: 0.2,
    embroidery: 0.18,
    panel: 0.12,
    embedding: 0.08,
    colour: 0.04,
    silhouette: 0.16,
  },
  LOWER_SKIRT: {
    border: 0.3,
    motif: 0.25,
    embroidery: 0.2,
    panel: 0.15,
    embedding: 0.07,
    colour: 0.03,
    silhouette: 0,
  },
  BORDER_ONLY: {
    border: 0.55,
    motif: 0.2,
    embroidery: 0.15,
    panel: 0.05,
    embedding: 0.05,
    colour: 0,
    silhouette: 0,
  },
  BLOUSE_ONLY: {
    border: 0.15,
    motif: 0.25,
    embroidery: 0.35,
    panel: 0.05,
    embedding: 0.15,
    colour: 0.05,
    silhouette: 0,
  },
  CUSTOMER_WEARING: {
    border: 0.4,
    motif: 0.2,
    embroidery: 0.15,
    panel: 0.1,
    embedding: 0.1,
    colour: 0.05,
    silhouette: 0,
  },
  MANNEQUIN: {
    border: 0.4,
    motif: 0.2,
    embroidery: 0.15,
    panel: 0.1,
    embedding: 0.1,
    colour: 0.05,
    silhouette: 0,
  },
  HANGER: {
    border: 0.4,
    motif: 0.25,
    embroidery: 0.15,
    panel: 0.1,
    embedding: 0.1,
    colour: 0,
    silhouette: 0,
  },
  FOLDED: {
    border: 0.35,
    motif: 0.25,
    embroidery: 0.2,
    panel: 0.1,
    embedding: 0.1,
    colour: 0,
    silhouette: 0,
  },
  EMBROIDERY_CLOSEUP: {
    border: 0.2,
    motif: 0.25,
    embroidery: 0.4,
    panel: 0.05,
    embedding: 0.1,
    colour: 0,
    silhouette: 0,
  },
  DUPATTA: {
    border: 0.35,
    motif: 0.25,
    embroidery: 0.2,
    panel: 0.05,
    embedding: 0.1,
    colour: 0.05,
    silhouette: 0,
  },
  DUPATTA_ONLY: {
    border: 0.35,
    motif: 0.25,
    embroidery: 0.2,
    panel: 0.05,
    embedding: 0.1,
    colour: 0.05,
    silhouette: 0,
  },
  MULTIPLE_DRESSES: {
    border: 0.35,
    motif: 0.2,
    embroidery: 0.15,
    panel: 0.1,
    embedding: 0.15,
    colour: 0.05,
    silhouette: 0,
  },
  PARTIAL_VIEW: {
    border: 0.4,
    motif: 0.25,
    embroidery: 0.2,
    panel: 0.05,
    embedding: 0.1,
    colour: 0,
    silhouette: 0,
  },
  LOW_LIGHT: {
    border: 0.4,
    motif: 0.25,
    embroidery: 0.2,
    panel: 0.1,
    embedding: 0.05,
    colour: 0,
    silhouette: 0,
  },
  BLURRY: {
    border: 0.35,
    motif: 0.25,
    embroidery: 0.2,
    panel: 0.1,
    embedding: 0.1,
    colour: 0,
    silhouette: 0,
  },
  WHATSAPP_SCREENSHOT: {
    border: 0.35,
    motif: 0.25,
    embroidery: 0.18,
    panel: 0.1,
    embedding: 0.09,
    colour: 0.03,
    silhouette: 0,
  },
};

/** Map legacy PartialViewType → DressQueryType. */
export function partialViewToQueryType(partial: PartialViewType): DressQueryType {
  switch (partial) {
    case "skirt":
      return "LOWER_SKIRT";
    case "blouse":
      return "BLOUSE_ONLY";
    case "dupatta":
      return "DUPATTA";
    case "embroidery_closeup":
      return "EMBROIDERY_CLOSEUP";
    default:
      return "FULL_DRESS";
  }
}

/**
 * Detect query presentation type from garment geometry + fingerprint cues.
 * Prefer decorative-region routing over silhouette for partial / worn / hanger shots.
 */
export function detectQueryType(
  garment: ProcessedGarment,
  fingerprint: FeatureFingerprint,
  queryViews: QueryReferenceFingerprint[],
  partialHint?: PartialViewType,
): DressQueryType {
  const { width, height, left, top } = garment.bounds;
  if (!width || !height) return "FULL_DRESS";

  const aspect = width / height;
  const coverW = width / Math.max(1, garment.originalWidth);
  const coverH = height / Math.max(1, garment.originalHeight);
  const topRatio = top / Math.max(1, garment.originalHeight);
  const bottomHeavy = topRatio > 0.35 || coverH < 0.55;

  // Border-only: wide short strip, strong border width ratio
  if (
    aspect > 1.6 &&
    coverH < 0.4 &&
    fingerprint.borderPattern.widthRatio >= 0.12
  ) {
    return "BORDER_ONLY";
  }

  // Lower skirt / hem crop (handheld skirt like customer floor shot)
  if ((aspect > 1.15 && bottomHeavy) || (coverH < 0.6 && topRatio > 0.25)) {
    return "LOWER_SKIRT";
  }

  // Blouse-only
  if (aspect < 0.85 && topRatio < 0.2 && coverH < 0.55) {
    return "BLOUSE_ONLY";
  }

  // Embroidery close-up
  if (fingerprint.embroideryDensity >= 14 && coverW < 0.55 && coverH < 0.55) {
    return "EMBROIDERY_CLOSEUP";
  }

  // Folded: compact square-ish with high texture energy
  if (
    aspect > 0.85 &&
    aspect < 1.25 &&
    coverW < 0.7 &&
    coverH < 0.7 &&
    fingerprint.embroideryDensity >= 8
  ) {
    // Could be folded or detail — prefer FOLDED when silhouette is ambiguous
    if (fingerprint.silhouette === "unknown" || coverH < 0.5) return "FOLDED";
  }

  if (partialHint && partialHint !== "full") {
    return partialViewToQueryType(partialHint);
  }

  // Full-frame with human-like framing → customer wearing heuristic
  if (coverH > 0.75 && coverW > 0.45 && aspect < 0.7) {
    return "CUSTOMER_WEARING";
  }

  // Tall full garment on plain-ish crop → mannequin / hanger catalog style
  if (coverH > 0.8 && aspect >= 0.45 && aspect <= 0.75) {
    return queryViews.length > 4 ? "MANNEQUIN" : "FULL_DRESS";
  }

  return "FULL_DRESS";
}

export function getQueryTypeWeights(queryType: DressQueryType): QueryTypeWeights {
  return QUERY_TYPE_WEIGHTS[queryType] ?? QUERY_TYPE_WEIGHTS.FULL_DRESS;
}

/** Normalize GPT / free-text query type into DressQueryType. */
export function normalizeDressQueryType(raw: string | null | undefined): DressQueryType | null {
  if (!raw) return null;
  const key = raw.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (key in QUERY_TYPE_WEIGHTS) return key as DressQueryType;
  if (key === "DUPATTA_ONLY") return "DUPATTA_ONLY";
  return null;
}

/** Score with query-type adaptive weights (0–100). */
export function scoreWithQueryTypeWeights(
  components: {
    border: number;
    motif: number;
    embroidery: number;
    panel: number;
    embedding: number;
    colour: number;
  },
  queryType: DressQueryType,
): number {
  const w = getQueryTypeWeights(queryType);
  const sum =
    w.border + w.motif + w.embroidery + w.panel + w.embedding + w.colour + w.silhouette;
  const raw =
    components.border * w.border +
    components.motif * w.motif +
    components.embroidery * w.embroidery +
    components.panel * w.panel +
    components.embedding * w.embedding +
    components.colour * w.colour;
  return Math.round((raw / Math.max(0.01, sum)) * 100);
}
