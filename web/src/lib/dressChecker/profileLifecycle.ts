/**
 * Atomic profile lifecycle: PENDING → PROCESSING → READY | FAILED | STALE.
 * Never leaves partially indexed searchable data.
 */
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { DRESS_CHECKER_ENGINE_VERSION } from "./constants";
import { IDENTIFICATION_INDEX_VERSION } from "@/lib/dressIdentificationTypes";
import {
  AI_STATUS,
  assessInventoryProfile,
  legacyStatusFromAi,
  validationFlagsToPrisma,
  type AiStatus,
  type ProfileValidationFlags,
} from "./profileReadiness";
import { isPgvectorAvailable } from "@/lib/ai/pgvector";

export async function ensurePendingAiProfile(itemId: number): Promise<void> {
  await prisma.inventoryAiProfile.upsert({
    where: { itemId },
    create: {
      itemId,
      aiStatus: AI_STATUS.PENDING,
      status: legacyStatusFromAi(AI_STATUS.PENDING),
      needsReindex: true,
      pipelineVersion: String(DRESS_CHECKER_ENGINE_VERSION),
    },
    update: {},
  });
}

export async function markProfileProcessing(itemId: number): Promise<void> {
  const now = new Date();
  await prisma.inventoryAiProfile.upsert({
    where: { itemId },
    create: {
      itemId,
      aiStatus: AI_STATUS.PROCESSING,
      status: legacyStatusFromAi(AI_STATUS.PROCESSING),
      lastIndexAttemptAt: now,
      needsReindex: true,
      indexFailureReason: null,
      error: null,
      processingError: null,
      pipelineVersion: String(DRESS_CHECKER_ENGINE_VERSION),
    },
    update: {
      aiStatus: AI_STATUS.PROCESSING,
      status: legacyStatusFromAi(AI_STATUS.PROCESSING),
      lastIndexAttemptAt: now,
      needsReindex: true,
      indexFailureReason: null,
      error: null,
      processingError: null,
      pipelineVersion: String(DRESS_CHECKER_ENGINE_VERSION),
    },
  });
}

/** Wipe searchable identity fields so incomplete profiles cannot be recalled. */
export async function clearSearchableProfileData(itemId: number): Promise<void> {
  await prisma.inventoryAiProfile.updateMany({
    where: { itemId },
    data: {
      dominantColor: null,
      secondaryColor: null,
      colourAnalysis: Prisma.DbNull,
      embroiderySignature: Prisma.DbNull,
      borderSignature: Prisma.DbNull,
      motifSignature: Prisma.DbNull,
      textureSignature: Prisma.DbNull,
      silhouetteSignature: Prisma.DbNull,
      stoneSignature: Prisma.DbNull,
      panelSignature: Prisma.DbNull,
      recognitionFingerprint: Prisma.DbNull,
      garmentAttributes: Prisma.DbNull,
      imageEmbeddingJson: Prisma.DbNull,
      colorHistogram: Prisma.DbNull,
      hasEmbedding: false,
      hasColourData: false,
      hasEmbroiderySignature: false,
      hasBorderSignature: false,
      hasMotifSignature: false,
      hasTextureSignature: false,
      hasPanelSignature: false,
      hasStoneSignature: false,
      hasIdentificationIndex: false,
      indexChecksum: null,
    },
  });

  if (await isPgvectorAvailable()) {
    await prisma.$executeRawUnsafe(
      `UPDATE inventory_ai_profiles SET embedding_vector = NULL WHERE item_id = $1`,
      itemId,
    );
  }

  await prisma.clothingItem.updateMany({
    where: { id: itemId },
    data: {
      identificationIndex: Prisma.DbNull,
      identificationIndexedAt: null,
      siglipEmbedding: Prisma.DbNull,
      siglipIndexedAt: null,
    },
  });
}

export async function markProfileFailed(
  itemId: number,
  reason: string,
  opts: { rollback?: boolean; incrementRepair?: boolean } = {},
): Promise<void> {
  if (opts.rollback !== false) {
    await clearSearchableProfileData(itemId);
  }

  const existing = await prisma.inventoryAiProfile.findUnique({
    where: { itemId },
    select: { autoRepairCount: true },
  });

  await prisma.inventoryAiProfile.upsert({
    where: { itemId },
    create: {
      itemId,
      aiStatus: AI_STATUS.FAILED,
      status: legacyStatusFromAi(AI_STATUS.FAILED),
      error: reason,
      processingError: reason,
      indexFailureReason: reason,
      needsReindex: true,
      lastIndexAttemptAt: new Date(),
      autoRepairCount: opts.incrementRepair ? 1 : 0,
      pipelineVersion: String(DRESS_CHECKER_ENGINE_VERSION),
    },
    update: {
      aiStatus: AI_STATUS.FAILED,
      status: legacyStatusFromAi(AI_STATUS.FAILED),
      error: reason,
      processingError: reason,
      indexFailureReason: reason,
      needsReindex: true,
      lastIndexAttemptAt: new Date(),
      ...(opts.incrementRepair
        ? { autoRepairCount: (existing?.autoRepairCount ?? 0) + 1 }
        : {}),
    },
  });
}

export async function markProfileStale(itemId: number, reason: string): Promise<void> {
  await prisma.inventoryAiProfile.updateMany({
    where: { itemId },
    data: {
      aiStatus: AI_STATUS.STALE,
      status: legacyStatusFromAi(AI_STATUS.STALE),
      needsReindex: true,
      indexFailureReason: reason,
    },
  });
}

export async function markProfileReady(
  itemId: number,
  input: {
    flags: ProfileValidationFlags;
    indexChecksum: string;
    aiStatus?: AiStatus;
  },
): Promise<void> {
  const now = new Date();
  const aiStatus = input.aiStatus ?? AI_STATUS.READY;
  await prisma.inventoryAiProfile.update({
    where: { itemId },
    data: {
      aiStatus,
      status: legacyStatusFromAi(aiStatus),
      needsReindex: false,
      indexFailureReason: null,
      error: null,
      processingError: null,
      lastSuccessfulIndexAt: now,
      lastIndexedAt: now,
      indexedAt: now,
      reindexedAt: now,
      indexChecksum: input.indexChecksum,
      ...validationFlagsToPrisma(input.flags),
    },
  });
}

/**
 * After draft persistence + embedding write, validate DB state.
 * READY only if complete; otherwise FAILED + rollback.
 */
export async function finalizeProfileAfterIndex(itemId: number): Promise<{
  ok: boolean;
  reasons: string[];
}> {
  const assessment = await assessInventoryProfile(itemId);
  if (!assessment) {
    await markProfileFailed(itemId, "Profile missing after index", { rollback: true });
    return { ok: false, reasons: ["profile missing"] };
  }

  if (!assessment.ready) {
    await markProfileFailed(itemId, assessment.reasons.join("; "), { rollback: true });
    return { ok: false, reasons: assessment.reasons };
  }

  await markProfileReady(itemId, {
    flags: assessment.flags,
    indexChecksum: assessment.indexChecksum || "",
  });
  return { ok: true, reasons: [] };
}

/** Find profiles that must be repaired by the self-healing job. */
export async function findProfilesNeedingRepair(limit = 200): Promise<number[]> {
  const engine = DRESS_CHECKER_ENGINE_VERSION;
  const rows = await prisma.$queryRawUnsafe<Array<{ item_id: number }>>(
    `SELECT p.item_id
     FROM inventory_ai_profiles p
     JOIN clothing_items c ON c.id = p.item_id
     WHERE c.photo IS NOT NULL AND c.photo <> ''
       AND (
         p.ai_status IS DISTINCT FROM 'READY'
         OR COALESCE(p.needs_reindex, false) = true
         OR COALESCE(p.matching_version, 0) < $1
         OR COALESCE(p.recognition_version, 0) < $1
         OR COALESCE(NULLIF(regexp_replace(p.pipeline_version, '[^0-9]', '', 'g'), ''), '0')::int < $1
         OR COALESCE(NULLIF(regexp_replace(c.identification_index->>'version', '[^0-9]', '', 'g'), ''), '0')::int < $2
         OR p.dominant_color IS NULL
         OR p.embedding_vector IS NULL
         OR p.embroidery_signature IS NULL
         OR p.border_signature IS NULL
         OR p.motif_signature IS NULL
         OR p.texture_signature IS NULL
         OR p.panel_signature IS NULL
         OR COALESCE(p.has_identification_index, false) = false
       )
     ORDER BY p.auto_repair_count ASC, p.item_id ASC
     LIMIT $3`,
    engine,
    IDENTIFICATION_INDEX_VERSION,
    limit,
  );
  return rows.map((r) => Number(r.item_id));
}
