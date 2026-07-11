import type { IdentificationIndex } from "../dressIdentificationTypes";
import type { FeatureFingerprint } from "./types";
import { DRESS_CHECKER_FINGERPRINT_VERSION } from "./types";

export { DRESS_CHECKER_FINGERPRINT_VERSION };

/** Permanent AI identity stored on InventoryAiProfile (not ClothingItem). */
export type StoredIdentityEmbeddings = {
  global: number[];
  colour: number[];
  texture: number[];
  embroidery: number[];
  border: number[];
  motif: number[];
  silhouette: number[];
  neckline: number[];
  sleeve: number[];
  dupatta: number[];
};

export type StoredIdentityProfile = {
  version: typeof DRESS_CHECKER_FINGERPRINT_VERSION;
  fingerprintVersion: number;
  recognitionModel: string;
  processingVersion: number;
  lastProcessedAt: string;
  globalEmbedding: number[];
  colourEmbedding: number[];
  textureEmbedding: number[];
  embroideryEmbedding: number[];
  borderEmbedding: number[];
  motifEmbedding: number[];
  silhouetteEmbedding: number[];
  necklineEmbedding: number[];
  sleeveEmbedding: number[];
  dupattaEmbedding: number[];
  localKeypoints: number[];
  featureDescriptors: number[];
  colourHistogram: number[];
  qualityScore: number;
  viewCount: number;
  referenceLabels: string[];
  processingMetadata: {
    durationMs: number;
    reason: string;
    imageCount: number;
  };
};

export function buildIdentityEmbeddingsFromIndex(
  index: IdentificationIndex,
  fingerprint: FeatureFingerprint,
): StoredIdentityEmbeddings {
  const primary = index.references[0];
  const emb = primary?.embeddings;
  return {
    global: emb?.global ?? [],
    colour: primary?.colorHistogram ?? fingerprint.colourHistogram,
    texture: fingerprint.fabricTextureDescriptor,
    embroidery: emb?.embroidery ?? [],
    border: emb?.border ?? [],
    motif: fingerprint.motifDistribution,
    silhouette: fingerprint.textureFeatures,
    neckline: fingerprint.localDescriptors.slice(0, 8),
    sleeve: fingerprint.localDescriptors.slice(8, 16),
    dupatta: fingerprint.orbKeypoints,
  };
}

export function buildStoredIdentityProfile(
  index: IdentificationIndex,
  fingerprint: FeatureFingerprint,
  modelId: string,
  reason: string,
  durationMs: number,
  imageCount: number,
): StoredIdentityProfile {
  const slots = buildIdentityEmbeddingsFromIndex(index, fingerprint);
  const primary = index.references[0];
  return {
    version: DRESS_CHECKER_FINGERPRINT_VERSION,
    fingerprintVersion: DRESS_CHECKER_FINGERPRINT_VERSION,
    recognitionModel: modelId,
    processingVersion: 7,
    lastProcessedAt: new Date().toISOString(),
    globalEmbedding: slots.global,
    colourEmbedding: slots.colour,
    textureEmbedding: slots.texture,
    embroideryEmbedding: slots.embroidery,
    borderEmbedding: slots.border,
    motifEmbedding: slots.motif,
    silhouetteEmbedding: slots.silhouette,
    necklineEmbedding: slots.neckline,
    sleeveEmbedding: slots.sleeve,
    dupattaEmbedding: slots.dupatta,
    localKeypoints: fingerprint.orbKeypoints,
    featureDescriptors: fingerprint.localDescriptors,
    colourHistogram: fingerprint.colourHistogram,
    qualityScore: fingerprint.qualityScore,
    viewCount: index.references.length,
    referenceLabels: index.references.map((r) => r.label),
    processingMetadata: { durationMs, reason, imageCount },
  };
}
