import { Prisma } from "@prisma/client";
import { DRESS_CHECKER_FINGERPRINT_VERSION } from "@/lib/dressChecker/types";
import { dateParam, dateParamReq } from "@/lib/restoreSql";

type Tx = Omit<
  Prisma.TransactionClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

function pick<T>(row: Record<string, unknown>, camel: string, snake: string): T | undefined {
  const v = row[camel] ?? row[snake];
  return v === undefined ? undefined : (v as T);
}

function jsonOrNull(v: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (v === undefined) return undefined;
  if (v === null) return Prisma.JsonNull;
  return v as Prisma.InputJsonValue;
}

function bool(v: unknown, fallback = false): boolean {
  if (v === undefined || v === null) return fallback;
  if (v === false || v === 0 || v === "0") return false;
  if (v === true || v === 1 || v === "1") return true;
  return Boolean(v);
}

/** Map one backup inventory row to a full clothing_items create payload. */
export function clothingItemDataFromBackup(
  i: Record<string, unknown>,
): Prisma.ClothingItemUncheckedCreateInput {
  const photo = (pick<string | null>(i, "photo", "photo") ?? null) as string | null;
  const thumbnailPhoto =
    pick<string | null>(i, "thumbnailPhoto", "thumbnail_photo") ?? photo;

  return {
    id: i.id as number,
    name: String(i.name),
    sku: String(i.sku),
    category: String(i.category),
    size: pick<string | null>(i, "size", "size") ?? null,
    color: pick<string | null>(i, "color", "color") ?? null,
    dailyRate: Number(pick<number>(i, "dailyRate", "daily_rate") ?? 0),
    deposit: Number(pick<number>(i, "deposit", "deposit") ?? 0),
    status: String(pick<string>(i, "status", "status") ?? "available"),
    itemType: String(pick<string>(i, "itemType", "item_type") ?? "clothing"),
    photo,
    originalPhoto: pick<string | null>(i, "originalPhoto", "original_photo") ?? null,
    enhancedPhoto: pick<string | null>(i, "enhancedPhoto", "enhanced_photo") ?? null,
    marketingPhoto: pick<string | null>(i, "marketingPhoto", "marketing_photo") ?? null,
    thumbnailPhoto,
    conditionNotes: pick<string | null>(i, "conditionNotes", "condition_notes") ?? null,
    createdAt: dateParamReq(pick<string>(i, "createdAt", "created_at")),
    subCategory: pick<string | null>(i, "subCategory", "sub_category") ?? null,
    hasNecklace: bool(pick(i, "hasNecklace", "has_necklace")),
    hasEarrings: bool(pick(i, "hasEarrings", "has_earrings")),
    hasTeeka: bool(pick(i, "hasTeeka", "has_teeka")),
    hasPasa: bool(pick(i, "hasPasa", "has_pasa")),
    hasSheeshpatti: bool(pick(i, "hasSheeshpatti", "has_sheeshpatti")),
    hasNath: bool(pick(i, "hasNath", "has_nath")),
    hasHathfool: bool(pick(i, "hasHathfool", "has_hathfool")),
    hasKamarband: bool(pick(i, "hasKamarband", "has_kamarband")),
    hasRings: bool(pick(i, "hasRings", "has_rings")),
    hasLongHar: bool(pick(i, "hasLongHar", "has_long_har")),
    inventoryGroupId: pick<string | null>(i, "inventoryGroupId", "inventory_group_id") ?? null,
    aiFingerprint: pick<string | null>(i, "aiFingerprint", "ai_fingerprint") ?? null,
    aiIndexedAt: dateParam(pick<string>(i, "aiIndexedAt", "ai_indexed_at")),
    siglipEmbedding: jsonOrNull(pick(i, "siglipEmbedding", "siglip_embedding")),
    siglipIndexedAt: dateParam(pick<string>(i, "siglipIndexedAt", "siglip_indexed_at")),
    identificationIndex: jsonOrNull(pick(i, "identificationIndex", "identification_index")),
    identificationIndexedAt: dateParam(
      pick<string>(i, "identificationIndexedAt", "identification_indexed_at"),
    ),
    recognitionImage: pick<string | null>(i, "recognitionImage", "recognition_image") ?? null,
    recognitionFingerprint: jsonOrNull(
      pick(i, "recognitionFingerprint", "recognition_fingerprint"),
    ),
    enhancementStatus: String(pick<string>(i, "enhancementStatus", "enhancement_status") ?? "none"),
    enhancementError: pick<string | null>(i, "enhancementError", "enhancement_error") ?? null,
    enhancementVersion: Number(pick<number>(i, "enhancementVersion", "enhancement_version") ?? 0),
    enhancementModel: pick<string | null>(i, "enhancementModel", "enhancement_model") ?? null,
    enhancementLatency: pick<number | null>(i, "enhancementLatency", "enhancement_latency") ?? null,
    enhancementStartedAt: dateParam(pick<string>(i, "enhancementStartedAt", "enhancement_started_at")),
    enhancementCompletedAt: dateParam(
      pick<string>(i, "enhancementCompletedAt", "enhancement_completed_at"),
    ),
    lastEnhancedAt: dateParam(pick<string>(i, "lastEnhancedAt", "last_enhanced_at")),
    enhancementUpdatedAt: dateParam(pick<string>(i, "enhancementUpdatedAt", "enhancement_updated_at")),
  };
}

function profileDataFromBackup(p: Record<string, unknown>): Prisma.InventoryAiProfileUncheckedCreateInput {
  const aiStatus = String(pick<string>(p, "aiStatus", "ai_status") ?? "PENDING");
  const status = String(pick<string>(p, "status", "status") ?? aiStatus.toLowerCase());

  return {
    itemId: p.itemId as number,
    status,
    aiStatus,
    error: pick<string | null>(p, "error", "error") ?? null,
    currentVersion: Number(pick<number>(p, "currentVersion", "current_version") ?? 0),
    pipelineVersion: String(pick<string>(p, "pipelineVersion", "pipeline_version") ?? "1"),
    indexedAt: dateParam(pick<string>(p, "indexedAt", "indexed_at")),
    updatedAt: dateParamReq(pick<string>(p, "updatedAt", "updated_at")),
    lastIndexAttemptAt: dateParam(pick<string>(p, "lastIndexAttemptAt", "last_index_attempt_at")),
    lastSuccessfulIndexAt: dateParam(
      pick<string>(p, "lastSuccessfulIndexAt", "last_successful_index_at"),
    ),
    indexFailureReason: pick<string | null>(p, "indexFailureReason", "index_failure_reason") ?? null,
    indexChecksum: pick<string | null>(p, "indexChecksum", "index_checksum") ?? null,
    needsReindex: bool(pick(p, "needsReindex", "needs_reindex")),
    autoRepairCount: Number(pick<number>(p, "autoRepairCount", "auto_repair_count") ?? 0),
    hasEmbedding: bool(pick(p, "hasEmbedding", "has_embedding")),
    hasColourData: bool(pick(p, "hasColourData", "has_colour_data")),
    hasEmbroiderySignature: bool(pick(p, "hasEmbroiderySignature", "has_embroidery_signature")),
    hasBorderSignature: bool(pick(p, "hasBorderSignature", "has_border_signature")),
    hasMotifSignature: bool(pick(p, "hasMotifSignature", "has_motif_signature")),
    hasTextureSignature: bool(pick(p, "hasTextureSignature", "has_texture_signature")),
    hasPanelSignature: bool(pick(p, "hasPanelSignature", "has_panel_signature")),
    hasStoneSignature: bool(pick(p, "hasStoneSignature", "has_stone_signature")),
    hasIdentificationIndex: bool(pick(p, "hasIdentificationIndex", "has_identification_index")),
    description: pick<string | null>(p, "description", "description") ?? null,
    searchText: pick<string | null>(p, "searchText", "search_text") ?? null,
    colourAnalysis: jsonOrNull(pick(p, "colourAnalysis", "colour_analysis")),
    garmentAttributes: jsonOrNull(pick(p, "garmentAttributes", "garment_attributes")),
    jewelleryAttributes: jsonOrNull(pick(p, "jewelleryAttributes", "jewellery_attributes")),
    qualityScores: jsonOrNull(pick(p, "qualityScores", "quality_scores")),
    duplicateFingerprint: jsonOrNull(pick(p, "duplicateFingerprint", "duplicate_fingerprint")),
    healthScore: pick<number | null>(p, "healthScore", "health_score") ?? null,
    healthIssues: jsonOrNull(pick(p, "healthIssues", "health_issues")),
    enhancedImage: pick<string | null>(p, "enhancedImage", "enhanced_image") ?? null,
    enhancementStatus: String(pick<string>(p, "enhancementStatus", "enhancement_status") ?? "none"),
    enhancementError: pick<string | null>(p, "enhancementError", "enhancement_error") ?? null,
    enhancementVersion: Number(pick<number>(p, "enhancementVersion", "enhancement_version") ?? 0),
    enhancementModel: pick<string | null>(p, "enhancementModel", "enhancement_model") ?? null,
    enhancementLatencyMs: pick<number | null>(p, "enhancementLatencyMs", "enhancement_latency_ms") ?? null,
    recognitionImage: pick<string | null>(p, "recognitionImage", "recognition_image") ?? null,
    recognitionFingerprint: jsonOrNull(pick(p, "recognitionFingerprint", "recognition_fingerprint")),
    recognitionVersion: Number(
      pick<number>(p, "recognitionVersion", "recognition_version") ?? DRESS_CHECKER_FINGERPRINT_VERSION,
    ),
    modelVersion: pick<string | null>(p, "modelVersion", "model_version") ?? null,
    qualityScore: pick<number | null>(p, "qualityScore", "quality_score") ?? null,
    lastProcessed: dateParam(pick<string>(p, "lastProcessed", "last_processed")),
    imageEmbeddingJson: jsonOrNull(pick(p, "imageEmbeddingJson", "image_embedding_json")),
    photoHash: pick<string | null>(p, "photoHash", "photo_hash") ?? null,
    differenceHash: pick<string | null>(p, "differenceHash", "difference_hash") ?? null,
    colorHistogram: jsonOrNull(pick(p, "colorHistogram", "color_histogram")),
    verificationMetadata: jsonOrNull(pick(p, "verificationMetadata", "verification_metadata")),
    processingError: pick<string | null>(p, "processingError", "processing_error") ?? null,
    reindexedAt: dateParam(pick<string>(p, "reindexedAt", "reindexed_at")),
    promptVersion: pick<string | null>(p, "promptVersion", "prompt_version") ?? null,
    aiVersion: pick<string | null>(p, "aiVersion", "ai_version") ?? null,
    dominantColor: pick<string | null>(p, "dominantColor", "dominant_color") ?? null,
    secondaryColor: pick<string | null>(p, "secondaryColor", "secondary_color") ?? null,
    embroiderySignature: jsonOrNull(pick(p, "embroiderySignature", "embroidery_signature")),
    borderSignature: jsonOrNull(pick(p, "borderSignature", "border_signature")),
    motifSignature: jsonOrNull(pick(p, "motifSignature", "motif_signature")),
    textureSignature: jsonOrNull(pick(p, "textureSignature", "texture_signature")),
    silhouetteSignature: jsonOrNull(pick(p, "silhouetteSignature", "silhouette_signature")),
    stoneSignature: jsonOrNull(pick(p, "stoneSignature", "stone_signature")),
    panelSignature: jsonOrNull(pick(p, "panelSignature", "panel_signature")),
    matchingVersion: Number(pick<number>(p, "matchingVersion", "matching_version") ?? 0),
    lastIndexedAt: dateParam(pick<string>(p, "lastIndexedAt", "last_indexed_at")),
  };
}

/** Rebuild minimal READY profiles from legacy backups that only stored AI data on clothing_items. */
function legacyProfileFromInventoryItem(
  i: Record<string, unknown>,
): Prisma.InventoryAiProfileUncheckedCreateInput | null {
  const itemId = i.id as number;
  const photo = pick<string | null>(i, "photo", "photo");
  const indexedAt = dateParam(
    pick<string>(i, "identificationIndexedAt", "identification_indexed_at"),
  );
  const identificationIndex = pick(i, "identificationIndex", "identification_index");
  if (!photo || (!indexedAt && !identificationIndex)) return null;

  const aiStatus = "READY";
  return {
    itemId,
    aiStatus,
    status: "ready",
    needsReindex: false,
    recognitionVersion: DRESS_CHECKER_FINGERPRINT_VERSION,
    recognitionImage:
      pick<string | null>(i, "recognitionImage", "recognition_image") ?? null,
    recognitionFingerprint: jsonOrNull(
      pick(i, "recognitionFingerprint", "recognition_fingerprint"),
    ),
    hasIdentificationIndex: !!identificationIndex,
    hasEmbedding: !!pick(i, "siglipEmbedding", "siglip_embedding"),
    indexedAt: indexedAt ?? new Date(),
    lastSuccessfulIndexAt: indexedAt,
    lastIndexedAt: indexedAt,
    garmentAttributes: jsonOrNull(identificationIndex),
  };
}

export async function restoreInventoryWithAi(
  tx: Tx,
  inventory: Array<Record<string, unknown>>,
  aiProfiles: Array<Record<string, unknown>> | undefined,
): Promise<{ inventoryCount: number; aiProfileCount: number }> {
  for (const i of inventory) {
    await tx.clothingItem.create({ data: clothingItemDataFromBackup(i) });
  }

  await tx.$executeRawUnsafe(
    `UPDATE "clothing_items" SET "thumbnail_photo" = "photo" WHERE "thumbnail_photo" IS NULL AND "photo" IS NOT NULL`,
  );

  let aiProfileCount = 0;

  if (aiProfiles?.length) {
    for (const p of aiProfiles) {
      const itemId = (p.itemId ?? p.item_id) as number;
      if (!itemId) continue;
      await tx.inventoryAiProfile.create({
        data: profileDataFromBackup({ ...p, itemId }),
      });
      aiProfileCount += 1;
    }
  } else {
    for (const i of inventory) {
      const legacy = legacyProfileFromInventoryItem(i);
      if (!legacy) continue;
      await tx.inventoryAiProfile.create({ data: legacy });
      aiProfileCount += 1;
    }
  }

  return { inventoryCount: inventory.length, aiProfileCount };
}
