import type { RecognitionFeatureFingerprint, ProcessedGarmentImage } from "./types";
import { RECOGNITION_PIPELINE_VERSION } from "./types";
import { inferSubCategory, resolveCategoryGroup } from "./constants";
import {
  analyzeBorder,
  analyzeDupatta,
  analyzeEmbroidery,
  analyzeNeckline,
  analyzeSilhouette,
  analyzeSleeve,
  analyzeTexture,
  computeOrbLikeFeatures,
  extractDominantColours,
  scoreImageQuality,
} from "./featureAnalysis";
import { resolveInventoryColourFamily } from "../inventoryColourSemantics";

export async function buildFeatureFingerprint(
  garment: ProcessedGarmentImage,
  category: string,
  name: string,
  subCategory?: string | null,
): Promise<RecognitionFeatureFingerprint> {
  const buf = garment.buffer;
  const group = resolveCategoryGroup(category);
  const sub = subCategory || inferSubCategory(category, name, group);

  const [
    colours,
    texture,
    embroidery,
    border,
    sleeve,
    neckline,
    silhouette,
    dupatta,
    orb,
    quality,
  ] = await Promise.all([
    extractDominantColours(buf),
    analyzeTexture(buf),
    analyzeEmbroidery(buf),
    analyzeBorder(buf),
    analyzeSleeve(buf),
    analyzeNeckline(buf),
    analyzeSilhouette(buf, garment.bounds),
    analyzeDupatta(buf),
    computeOrbLikeFeatures(buf),
    scoreImageQuality(buf),
  ]);

  return {
    version: RECOGNITION_PIPELINE_VERSION,
    primaryColour: colours.primary,
    secondaryColour: colours.secondary,
    accentColours: colours.accents,
    colourHistogram: colours.histogram,
    colourFamily: resolveInventoryColourFamily(name, colours.family, colours.histogram),
    fabricTextureDescriptor: texture,
    embroideryDensity: embroidery.density,
    embroideryStyle: embroidery.style,
    stoneWork: embroidery.stoneWork,
    mirrorWork: embroidery.mirrorWork,
    threadPattern: embroidery.threadPattern,
    borderPattern: border,
    sleeveLength: sleeve,
    necklineShape: neckline,
    silhouette: silhouette.silhouette,
    garmentShape: silhouette.garmentShape,
    dupattaPattern: dupatta.pattern,
    dupattaBorder: dupatta.border,
    motifDistribution: orb.motifDistribution,
    textureFeatures: texture,
    orbKeypoints: orb.keypoints,
    localDescriptors: orb.descriptors,
    garmentBounds: garment.bounds,
    categoryGroup: group,
    category,
    subCategory: sub,
    qualityScore: quality,
    processedAt: new Date().toISOString(),
  };
}

export function parseFeatureFingerprint(
  raw: unknown,
  inventoryName = "",
  inventoryColor?: string | null,
): RecognitionFeatureFingerprint | null {
  if (!raw || typeof raw !== "object") return null;
  const fp = raw as RecognitionFeatureFingerprint;
  if (fp.version !== RECOGNITION_PIPELINE_VERSION && fp.version !== 3) return null;
  if (!fp.colourHistogram?.length) return null;
  return {
    ...fp,
    colourFamily: resolveInventoryColourFamily(
      inventoryName,
      fp.colourFamily,
      fp.colourHistogram,
      inventoryColor,
    ),
  };
}
