import { isolateGarment } from "../recognitionPipeline/garmentIsolation";
import { normalizeGarmentImage } from "./normalization";
import type { ProcessedGarment } from "./types";

/**
 * Stage 2 — Garment detection + background suppression.
 * Only the garment proceeds to feature extraction.
 */
export async function detectAndIsolateGarment(buffer: Buffer): Promise<ProcessedGarment> {
  const normalized = await normalizeGarmentImage(buffer);
  const garment = await isolateGarment(normalized);
  return garment;
}

/** @deprecated alias */
export const preprocessGarmentImage = detectAndIsolateGarment;
