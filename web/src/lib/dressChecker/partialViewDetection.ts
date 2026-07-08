import type { FeatureFingerprint, ProcessedGarment } from "./types";
import type { QueryReferenceFingerprint } from "../dressIdentificationTypes";
import { cosineToPercent, cosineSimilarity } from "../siglipMath";

export type PartialViewType = "full" | "skirt" | "blouse" | "dupatta" | "embroidery_closeup";

/** Detect whether the upload shows a partial garment region. */
export function detectPartialView(
  garment: ProcessedGarment,
  fingerprint: FeatureFingerprint,
  queryViews: QueryReferenceFingerprint[],
): PartialViewType {
  const { width, height } = garment.bounds;
  if (!width || !height) return "full";

  const aspect = width / height;
  const primary = queryViews[0];
  if (!primary?.embeddings) return "full";

  const emb = primary.embeddings;
  const selfScores = {
    skirt: cosineToPercent(cosineSimilarity(emb.skirt, emb.skirt)),
    blouse: cosineToPercent(cosineSimilarity(emb.blouse, emb.blouse)),
    border: cosineToPercent(cosineSimilarity(emb.border, emb.border)),
    embroidery: cosineToPercent(cosineSimilarity(emb.embroidery, emb.embroidery)),
    global: cosineToPercent(cosineSimilarity(emb.global, emb.global)),
  };

  // Very wide crop → likely skirt panel
  if (aspect > 1.35 && height < garment.originalHeight * 0.55) return "skirt";
  // Tall narrow upper crop → blouse
  if (aspect < 0.75 && garment.bounds.top < garment.originalHeight * 0.25) return "blouse";
  // Small square crop with heavy embroidery metadata
  if (fingerprint.embroideryDensity >= 12 && width < garment.originalWidth * 0.5) {
    return "embroidery_closeup";
  }
  if (fingerprint.dupattaPattern && aspect > 1.1 && aspect < 1.5) return "dupatta";

  return "full";
}
