import { buildFeatureFingerprint } from "../recognitionPipeline/buildFingerprint";
import { resolveInventoryColourFamily } from "../inventoryColourSemantics";
import type { FeatureFingerprint, ProcessedGarment } from "./types";
import { DRESS_CHECKER_FINGERPRINT_VERSION } from "./types";

export async function extractFeatureFingerprint(
  garment: ProcessedGarment,
  category: string,
  name: string,
  subCategory?: string | null,
): Promise<FeatureFingerprint> {
  const fp = await buildFeatureFingerprint(garment, category, name, subCategory);
  return {
    ...fp,
    version: DRESS_CHECKER_FINGERPRINT_VERSION,
    colourFamily: resolveInventoryColourFamily(name, fp.colourFamily, fp.colourHistogram),
  } as FeatureFingerprint;
}

export function parseStoredFingerprint(
  raw: unknown,
  inventoryName = "",
  inventoryColor?: string | null,
): FeatureFingerprint | null {
  if (!raw || typeof raw !== "object") return null;
  const fp = raw as FeatureFingerprint;
  if (fp.version !== DRESS_CHECKER_FINGERPRINT_VERSION && fp.version !== 6 && fp.version !== 5 && fp.version !== 4 && fp.version !== 3 && fp.version !== 2) return null;
  if (!fp.colourHistogram?.length) return null;
  return {
    ...fp,
    version: DRESS_CHECKER_FINGERPRINT_VERSION,
    colourFamily: resolveInventoryColourFamily(
      inventoryName,
      fp.colourFamily,
      fp.colourHistogram,
      inventoryColor,
    ),
  };
}
