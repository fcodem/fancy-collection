import sharp from "sharp";
import { validateDressCheckerImage } from "../dressCheckerValidation";
import { buildQueryFingerprints } from "../dressIdentificationIndex";
import { inferSubCategory, resolveCategoryGroup } from "../recognitionPipeline/constants";
import { detectAndIsolateGarment } from "./imageProcessing";
import { extractFeatureFingerprint } from "./featureExtraction";
import { QUERY_ROTATION_DEGREES } from "./constants";
import { detectPartialView } from "./partialViewDetection";
import type { QueryAnalysis, StageLog } from "./types";
import type { QueryReferenceFingerprint } from "../dressIdentificationTypes";

async function timed<T>(stage: string, fn: () => Promise<T>, log: StageLog[]): Promise<T> {
  const start = Date.now();
  const result = await fn();
  log.push({ stage, durationMs: Date.now() - start });
  return result;
}

async function buildMultiViewQueryFingerprints(garmentBuffer: Buffer): Promise<QueryReferenceFingerprint[]> {
  const allFingerprints: QueryReferenceFingerprint[] = [];

  for (const deg of QUERY_ROTATION_DEGREES) {
    const buffer =
      deg === 0
        ? garmentBuffer
        : await sharp(garmentBuffer).rotate(deg).jpeg({ quality: 94 }).toBuffer();
    const fps = await buildQueryFingerprints(buffer);
    for (const fp of fps) {
      allFingerprints.push({ ...fp, source: `rot${deg}_${fp.source}` });
    }
  }

  return allFingerprints;
}

/**
 * Full v4 query pipeline:
 * validate → normalize → isolate → multi-view fingerprints → structured features
 */
export async function analyzeQueryImage(
  buffer: Buffer,
  mime?: string,
  hints: { category?: string; name?: string } = {},
): Promise<QueryAnalysis> {
  const stageLog: StageLog[] = [];

  const validation = await timed("image_validation", async () => {
    const result = await validateDressCheckerImage(buffer, mime);
    if (!result.ok) throw new Error(result.message);
    return { ok: true, warnings: result.warnings };
  }, stageLog);

  const garment = await timed("garment_detection", () => detectAndIsolateGarment(buffer), stageLog);

  const category = hints.category || "Lehenga";
  const group = resolveCategoryGroup(category);
  const subCategory = inferSubCategory(category, hints.name || "", group);

  const fingerprint = await timed(
    "feature_extraction",
    () => extractFeatureFingerprint(garment, category, hints.name || "", subCategory),
    stageLog,
  );
  fingerprint.categoryGroup = group;
  fingerprint.category = category;
  fingerprint.subCategory = subCategory;

  const queryFingerprints = await timed(
    "multi_view_embedding",
    () => buildMultiViewQueryFingerprints(garment.buffer),
    stageLog,
  );

  const primary = queryFingerprints[0];
  if (!primary) throw new Error("Failed to build query fingerprints");

  const partialView = detectPartialView(garment, fingerprint, queryFingerprints);

  return {
    validation,
    garment,
    fingerprint,
    queryFingerprints,
    embeddings: primary.embeddings,
    categoryGroup: group,
    category,
    subCategory,
    stageLog,
    viewCount: queryFingerprints.length,
    partialView,
  };
}
