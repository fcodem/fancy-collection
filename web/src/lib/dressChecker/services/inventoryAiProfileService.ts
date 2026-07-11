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
import { featureFingerprintToFineGrained } from "../fineGrainedTypes";
import type { InventorySignatures } from "../inventorySignatures";
import { ENTERPRISE_MATCHING_VERSION } from "../enterpriseIndexing";
import { AI_STATUS, legacyStatusFromAi } from "../profileReadiness";

export type SaveIdentityProfileInput = {
  itemId: number;
  recognitionImage: string;
  fingerprint: FeatureFingerprint;
  identificationIndex: IdentificationIndex;
  modelId: string;
  reason: string;
  durationMs: number;
  imageCount: number;
  /** Pre-computed hashes + embedding from indexingService (required for READY). */
  garmentBuffer?: Buffer;
  signatures?: InventorySignatures;
  matchingVersion?: number;
  /** When true, persist draft only — caller must finalize READY after embedding + validation. */
  draftOnly?: boolean;
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

/** Persist AI identity draft (PROCESSING). Does not mark READY — use finalizeProfileAfterIndex. */
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

  const primaryRef = input.identificationIndex.references[0];
  const regionEmbeddings = primaryRef?.embeddings
    ? {
        blouseEmbedding: primaryRef.embeddings.blouse,
        dupattaEmbedding: undefined,
        lehengaEmbedding: primaryRef.embeddings.skirt,
        borderEmbedding: primaryRef.embeddings.border,
        embroideryEmbedding: primaryRef.embeddings.embroidery,
        globalEmbedding: primaryRef.embeddings.global,
      }
    : undefined;

  const recognitionFingerprint = {
    ...input.fingerprint,
    fineGrained: featureFingerprintToFineGrained(input.fingerprint, regionEmbeddings),
  };

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

  const now = new Date();
  const matchingVersion = input.matchingVersion ?? ENTERPRISE_MATCHING_VERSION;
  const sigs = input.signatures;
  const colourFamily = input.fingerprint.colourFamily;
  const dominantColor = sigs?.dominantColor ?? input.fingerprint.primaryColour;
  const secondaryColor = sigs?.secondaryColor ?? input.fingerprint.secondaryColour;

  const draftStatus = AI_STATUS.PROCESSING;

  await prisma.inventoryAiProfile.upsert({
    where: { itemId: input.itemId },
    create: {
      itemId: input.itemId,
      aiStatus: draftStatus,
      status: legacyStatusFromAi(draftStatus),
      needsReindex: true,
      pipelineVersion: String(DRESS_CHECKER_ENGINE_VERSION),
      modelVersion: input.modelId,
      recognitionImage: input.recognitionImage,
      recognitionFingerprint: recognitionFingerprint as unknown as Prisma.InputJsonValue,
      recognitionVersion: DRESS_CHECKER_FINGERPRINT_VERSION,
      qualityScore: input.fingerprint.qualityScore,
      lastProcessed: now,
      matchingVersion,
      dominantColor,
      secondaryColor,
      embroiderySignature: (sigs?.embroidery ?? null) as Prisma.InputJsonValue,
      borderSignature: (sigs?.border ?? null) as Prisma.InputJsonValue,
      motifSignature: (sigs?.motif ?? null) as Prisma.InputJsonValue,
      textureSignature: (sigs?.texture ?? null) as Prisma.InputJsonValue,
      silhouetteSignature: (sigs?.silhouette ?? null) as Prisma.InputJsonValue,
      stoneSignature: (sigs?.stone ?? null) as Prisma.InputJsonValue,
      panelSignature: (sigs?.panel ?? null) as Prisma.InputJsonValue,
      hasColourData: !!(dominantColor && colourFamily && colourFamily !== "unknown"),
      hasEmbroiderySignature: !!sigs?.embroidery,
      hasBorderSignature: !!sigs?.border,
      hasMotifSignature: !!sigs?.motif,
      hasTextureSignature: !!sigs?.texture,
      hasPanelSignature: !!sigs?.panel,
      hasStoneSignature: !!sigs?.stone,
      hasIdentificationIndex: (input.identificationIndex.references?.length ?? 0) > 0,
      hasEmbedding: false,
      colourAnalysis: {
        primary: input.fingerprint.primaryColour,
        secondary: input.fingerprint.secondaryColour,
        accents: input.fingerprint.accentColours,
        histogram: input.fingerprint.colourHistogram,
        family: colourFamily,
        percentages: input.fingerprint.colourDiagnostics?.dominantPercentages ?? null,
        diagnostics: input.fingerprint.colourDiagnostics ?? null,
      },
      garmentAttributes: garmentAttributes as unknown as Prisma.InputJsonValue,
    },
    update: {
      aiStatus: draftStatus,
      status: legacyStatusFromAi(draftStatus),
      needsReindex: true,
      error: null,
      processingError: null,
      indexFailureReason: null,
      pipelineVersion: String(DRESS_CHECKER_ENGINE_VERSION),
      modelVersion: input.modelId,
      recognitionImage: input.recognitionImage,
      recognitionFingerprint: recognitionFingerprint as unknown as Prisma.InputJsonValue,
      recognitionVersion: DRESS_CHECKER_FINGERPRINT_VERSION,
      qualityScore: input.fingerprint.qualityScore,
      lastProcessed: now,
      matchingVersion,
      dominantColor,
      secondaryColor,
      embroiderySignature: (sigs?.embroidery ?? null) as Prisma.InputJsonValue,
      borderSignature: (sigs?.border ?? null) as Prisma.InputJsonValue,
      motifSignature: (sigs?.motif ?? null) as Prisma.InputJsonValue,
      textureSignature: (sigs?.texture ?? null) as Prisma.InputJsonValue,
      silhouetteSignature: (sigs?.silhouette ?? null) as Prisma.InputJsonValue,
      stoneSignature: (sigs?.stone ?? null) as Prisma.InputJsonValue,
      panelSignature: (sigs?.panel ?? null) as Prisma.InputJsonValue,
      hasColourData: !!(dominantColor && colourFamily && colourFamily !== "unknown"),
      hasEmbroiderySignature: !!sigs?.embroidery,
      hasBorderSignature: !!sigs?.border,
      hasMotifSignature: !!sigs?.motif,
      hasTextureSignature: !!sigs?.texture,
      hasPanelSignature: !!sigs?.panel,
      hasStoneSignature: !!sigs?.stone,
      hasIdentificationIndex: (input.identificationIndex.references?.length ?? 0) > 0,
      hasEmbedding: false,
      colourAnalysis: {
        primary: input.fingerprint.primaryColour,
        secondary: input.fingerprint.secondaryColour,
        accents: input.fingerprint.accentColours,
        histogram: input.fingerprint.colourHistogram,
        family: colourFamily,
        percentages: input.fingerprint.colourDiagnostics?.dominantPercentages ?? null,
        diagnostics: input.fingerprint.colourDiagnostics ?? null,
      },
      garmentAttributes: garmentAttributes as unknown as Prisma.InputJsonValue,
    },
  });

  if (input.garmentBuffer && !input.draftOnly) {
    const { indexImageBuffers } = await import("../indexingService");
    await indexImageBuffers(input.itemId, input.garmentBuffer, input.reason);
    await prisma.inventoryAiProfile.update({
      where: { itemId: input.itemId },
      data: { hasEmbedding: true },
    });
  }

  await logProfileEvent(input.itemId, "identity_profile_v5", `Draft v${DRESS_CHECKER_ENGINE_VERSION}`, {
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

export {
  markProfileProcessing,
  markProfileFailed as markProfileError,
} from "../profileLifecycle";
