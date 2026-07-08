import { Prisma } from "@prisma/client";
import prisma from "../../prisma";
import type { IdentificationIndex } from "../../dressIdentificationTypes";
import type { FeatureFingerprint } from "../types";
import {
  buildStoredIdentityProfile,
  type StoredIdentityProfile,
  DRESS_CHECKER_FINGERPRINT_VERSION,
} from "../identityProfile";
import { DRESS_CHECKER_ENGINE_VERSION } from "../constants";
import { logProfileEvent } from "../../inventoryAiProfile/generateProfile";
import { buildDressFingerprintSummary } from "../dressFingerprintSummary";
import { SIGLIP_EMBEDDING_DIM } from "../../siglipPreprocess";

export type SaveIdentityProfileInput = {
  itemId: number;
  recognitionImage: string;
  fingerprint: FeatureFingerprint;
  identificationIndex: IdentificationIndex;
  modelId: string;
  reason: string;
  durationMs: number;
  imageCount: number;
};

type GarmentAttributesV5 = {
  category: string;
  subcategory: string;
  silhouette: string;
  sleeveType: string;
  neckType: string;
  embroideryType: string;
  embroideryDensity: number;
  stoneWork: boolean;
  mirrorWork: boolean;
  viewCount: number;
  referenceLabels: string[];
  identityEmbeddings: StoredIdentityProfile;
  identificationIndex: IdentificationIndex;
  processingMetadata: StoredIdentityProfile["processingMetadata"];
  dressFingerprint?: ReturnType<typeof buildDressFingerprintSummary>;
};

/** Persist AI identity to InventoryAiProfile — canonical storage (JSON fields, no ClothingItem mutation). */
export async function saveInventoryIdentityProfile(input: SaveIdentityProfileInput): Promise<void> {
  const identityProfile = buildStoredIdentityProfile(
    input.identificationIndex,
    input.fingerprint,
    input.modelId,
    input.reason,
    input.durationMs,
    input.imageCount,
  );

  const dressFingerprint = buildDressFingerprintSummary(input.fingerprint, SIGLIP_EMBEDDING_DIM);

  const garmentAttributes: GarmentAttributesV5 = {
    category: input.fingerprint.category,
    subcategory: input.fingerprint.subCategory,
    silhouette: input.fingerprint.silhouette,
    sleeveType: input.fingerprint.sleeveLength,
    neckType: input.fingerprint.necklineShape,
    embroideryType: input.fingerprint.embroideryStyle,
    embroideryDensity: input.fingerprint.embroideryDensity,
    stoneWork: input.fingerprint.stoneWork,
    mirrorWork: input.fingerprint.mirrorWork,
    viewCount: input.identificationIndex.references.length,
    referenceLabels: input.identificationIndex.references.map((r) => r.label),
    identityEmbeddings: identityProfile,
    identificationIndex: input.identificationIndex,
    processingMetadata: identityProfile.processingMetadata,
    dressFingerprint,
  };

  await prisma.inventoryAiProfile.upsert({
    where: { itemId: input.itemId },
    create: {
      itemId: input.itemId,
      status: "ready",
      pipelineVersion: String(DRESS_CHECKER_ENGINE_VERSION),
      modelVersion: input.modelId,
      recognitionImage: input.recognitionImage,
      recognitionFingerprint: input.fingerprint as unknown as Prisma.InputJsonValue,
      recognitionVersion: DRESS_CHECKER_FINGERPRINT_VERSION,
      qualityScore: input.fingerprint.qualityScore,
      lastProcessed: new Date(),
      indexedAt: new Date(),
      colourAnalysis: {
        primary: input.fingerprint.primaryColour,
        secondary: input.fingerprint.secondaryColour,
        accents: input.fingerprint.accentColours,
        histogram: input.fingerprint.colourHistogram,
      },
      garmentAttributes: garmentAttributes as unknown as Prisma.InputJsonValue,
    },
    update: {
      status: "ready",
      error: null,
      pipelineVersion: String(DRESS_CHECKER_ENGINE_VERSION),
      modelVersion: input.modelId,
      recognitionImage: input.recognitionImage,
      recognitionFingerprint: input.fingerprint as unknown as Prisma.InputJsonValue,
      recognitionVersion: DRESS_CHECKER_FINGERPRINT_VERSION,
      qualityScore: input.fingerprint.qualityScore,
      lastProcessed: new Date(),
      indexedAt: new Date(),
      colourAnalysis: {
        primary: input.fingerprint.primaryColour,
        secondary: input.fingerprint.secondaryColour,
        accents: input.fingerprint.accentColours,
        histogram: input.fingerprint.colourHistogram,
      },
      garmentAttributes: garmentAttributes as unknown as Prisma.InputJsonValue,
    },
  });

  await logProfileEvent(input.itemId, "identity_profile_v5", `Saved v${DRESS_CHECKER_ENGINE_VERSION}`, {
    modelVersion: input.modelId,
    durationMs: input.durationMs,
  });
}

export function parseStoredIdentityProfile(raw: unknown): StoredIdentityProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as StoredIdentityProfile;
  if (!p.globalEmbedding?.length) return null;
  return p;
}

export function parseProfileIdentificationIndex(garmentAttributes: unknown): IdentificationIndex | null {
  if (!garmentAttributes || typeof garmentAttributes !== "object") return null;
  const ga = garmentAttributes as GarmentAttributesV5;
  if (!ga.identificationIndex?.references?.length) return null;
  return ga.identificationIndex;
}

export async function markProfileProcessing(itemId: number): Promise<void> {
  await prisma.inventoryAiProfile.upsert({
    where: { itemId },
    create: { itemId, status: "processing", pipelineVersion: String(DRESS_CHECKER_ENGINE_VERSION) },
    update: { status: "processing", error: null, pipelineVersion: String(DRESS_CHECKER_ENGINE_VERSION) },
  });
}

export async function markProfileError(itemId: number, message: string): Promise<void> {
  await prisma.inventoryAiProfile.upsert({
    where: { itemId },
    create: { itemId, status: "error", error: message },
    update: { status: "error", error: message },
  });
}
