import type { ComponentScores } from "./dressIdentificationTypes";
import { SIGLIP_EMBEDDING_DIM, SIGLIP_MODEL_ID } from "./siglipPreprocess";

import type { HybridComponentScores } from "./recognitionPipeline/types";

export type DressCheckerDebugMatch = {
  rank: number;
  sku: string;
  name: string;
  photo: string;
  finalScore: number;
  globalScore: number;
  borderScore: number;
  embroideryScore: number;
  textureScore: number;
  colorScore: number;
  hybridScores?: HybridComponentScores;
  rejectedRules?: string[];
  bestRefId: string;
  bestRefLabel: string;
  bestQuerySource: string;
  rankReason: string;
};

export type DressCheckerDebugPayload = {
  uploadedImage: { width: number; height: number; bytes: number };
  embeddingModel: string;
  embeddingDimension: number;
  embeddingVersion: number;
  preprocessingVersion: number;
  preprocessingPipeline: string;
  embeddingGenerationMs: number;
  searchMs: number;
  memoryUsageMb: number;
  inventoryImagesUsed: number;
  staleIndexCount: number;
  referenceImageSelected: string;
  inventoryImageUsed: string;
  topMatches: DressCheckerDebugMatch[];
  componentScores: ComponentScores | null;
  pipelineStages?: Array<{ stage: string; durationMs: number; detail?: string }>;
  candidateFilterStages?: Array<{ stage: number; name: string; before: number; after: number }>;
  queryFingerprint?: Record<string, unknown>;
};

export function isDressCheckerDebugEnabled(explicitDebug?: boolean): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return explicitDebug === true || process.env.DRESS_CHECKER_DEBUG === "1";
}

export function componentScoresToDebug(components: ComponentScores): ComponentScores {
  return { ...components };
}

export const DRESS_CHECKER_MODEL = SIGLIP_MODEL_ID;
export const DRESS_CHECKER_DIM = SIGLIP_EMBEDDING_DIM;
