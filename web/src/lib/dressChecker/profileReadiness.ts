/**
 * Enterprise dress-checker profile readiness — READY only when fully validated.
 */
import { createHash } from "crypto";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { DRESS_CHECKER_ENGINE_VERSION } from "./constants";
import { DRESS_CHECKER_FINGERPRINT_VERSION } from "./types";
import { IDENTIFICATION_INDEX_VERSION } from "@/lib/dressIdentificationTypes";

export const AI_STATUS = {
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
  READY: "READY",
  FAILED: "FAILED",
  STALE: "STALE",
  RETRYING: "RETRYING",
} as const;

export type AiStatus = (typeof AI_STATUS)[keyof typeof AI_STATUS];

export const CURRENT_PIPELINE_VERSION = DRESS_CHECKER_ENGINE_VERSION;
export const CURRENT_RECOGNITION_VERSION = DRESS_CHECKER_FINGERPRINT_VERSION;
export const CURRENT_MATCHING_VERSION = DRESS_CHECKER_ENGINE_VERSION;

/** Legacy `status` column mirror (lowercase). */
export function legacyStatusFromAi(aiStatus: AiStatus): string {
  return aiStatus.toLowerCase();
}

export type ProfileValidationFlags = {
  hasEmbedding: boolean;
  hasColourData: boolean;
  hasEmbroiderySignature: boolean;
  hasBorderSignature: boolean;
  hasMotifSignature: boolean;
  hasTextureSignature: boolean;
  hasPanelSignature: boolean;
  hasStoneSignature: boolean;
  hasIdentificationIndex: boolean;
};

export type ProfileReadinessResult = {
  ready: boolean;
  aiStatus: AiStatus;
  reasons: string[];
  flags: ProfileValidationFlags;
  pipelineVersion: number;
  recognitionVersion: number;
  matchingVersion: number;
  colourFamily: string | null;
  dominantColor: string | null;
  indexChecksum: string | null;
};

function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function hasJsonPayload(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "string") return v.length > 2;
  if (typeof v === "object") return Object.keys(v as object).length > 0;
  return false;
}

function parseVersionInt(v: string | number | null | undefined): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^\d+$/.test(v.trim())) return Number(v.trim());
  return 0;
}

function colourFamilyFromProfile(row: {
  dominantColor: string | null;
  colourAnalysis: unknown;
  recognitionFingerprint: unknown;
}): string | null {
  const ca = asObject(row.colourAnalysis);
  if (typeof ca?.family === "string" && ca.family) return ca.family;
  const fp = asObject(row.recognitionFingerprint);
  if (typeof fp?.colourFamily === "string" && fp.colourFamily) return fp.colourFamily;
  return null;
}

export function computeIndexChecksum(parts: {
  itemId: number;
  pipelineVersion: number;
  recognitionVersion: number;
  matchingVersion: number;
  dominantColor: string | null;
  colourFamily: string | null;
  identificationContentHash: string | null;
  signatureKeys: string[];
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        itemId: parts.itemId,
        pipelineVersion: parts.pipelineVersion,
        recognitionVersion: parts.recognitionVersion,
        matchingVersion: parts.matchingVersion,
        dominantColor: parts.dominantColor,
        colourFamily: parts.colourFamily,
        identificationContentHash: parts.identificationContentHash,
        signatureKeys: parts.signatureKeys,
      }),
    )
    .digest("hex")
    .slice(0, 32);
}

export async function profileHasEmbeddingVector(itemId: number): Promise<boolean> {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ ok: boolean }>>(
      `SELECT (embedding_vector IS NOT NULL) AS ok
       FROM inventory_ai_profiles WHERE item_id = $1`,
      itemId,
    );
    return !!rows[0]?.ok;
  } catch {
    return false;
  }
}

/** Evaluate readiness from a loaded profile row (+ optional live embedding check). */
export function evaluateProfileReadiness(
  row: {
    itemId: number;
    dominantColor: string | null;
    secondaryColor: string | null;
    colourAnalysis: unknown;
    recognitionFingerprint: unknown;
    embroiderySignature: unknown;
    borderSignature: unknown;
    motifSignature: unknown;
    textureSignature: unknown;
    panelSignature: unknown;
    stoneSignature: unknown;
    garmentAttributes: unknown;
    pipelineVersion: string | null;
    recognitionVersion: number | null;
    matchingVersion: number | null;
  },
  opts: { hasEmbeddingVector: boolean; hasIdentificationIndex?: boolean },
): ProfileReadinessResult {
  const reasons: string[] = [];
  const pipelineVersion = parseVersionInt(row.pipelineVersion);
  const recognitionVersion = row.recognitionVersion ?? 0;
  const matchingVersion = row.matchingVersion ?? 0;

  const ga = asObject(row.garmentAttributes);
  const indexFromGa = asObject(ga?.identificationIndex);
  const refs = Array.isArray(indexFromGa?.references) ? indexFromGa!.references : [];
  const indexVersion = Number(indexFromGa?.version || 0);
  const hasIdentificationIndex =
    opts.hasIdentificationIndex ?? (refs.length > 0 && indexVersion === IDENTIFICATION_INDEX_VERSION);

  const colourFamily = colourFamilyFromProfile(row);
  const dominantColor = row.dominantColor?.trim() || null;

  const flags: ProfileValidationFlags = {
    hasEmbedding: opts.hasEmbeddingVector,
    hasColourData: !!(dominantColor && colourFamily && colourFamily !== "unknown"),
    hasEmbroiderySignature: hasJsonPayload(row.embroiderySignature),
    hasBorderSignature: hasJsonPayload(row.borderSignature),
    hasMotifSignature: hasJsonPayload(row.motifSignature),
    hasTextureSignature: hasJsonPayload(row.textureSignature),
    hasPanelSignature: hasJsonPayload(row.panelSignature),
    hasStoneSignature: hasJsonPayload(row.stoneSignature),
    hasIdentificationIndex,
  };

  if (!flags.hasEmbedding) reasons.push("missing embedding_vector");
  if (!dominantColor) reasons.push("missing dominant_color");
  if (!colourFamily || colourFamily === "unknown") reasons.push("missing colour_family");
  if (!flags.hasEmbroiderySignature) reasons.push("missing embroidery_signature");
  if (!flags.hasBorderSignature) reasons.push("missing border_signature");
  if (!flags.hasMotifSignature) reasons.push("missing motif_signature");
  if (!flags.hasTextureSignature) reasons.push("missing texture_signature");
  if (!flags.hasPanelSignature) reasons.push("missing panel_signature");
  if (!flags.hasStoneSignature) reasons.push("missing stone_signature");
  if (!flags.hasIdentificationIndex) {
    reasons.push(
      indexVersion && indexVersion !== IDENTIFICATION_INDEX_VERSION
        ? `identificationIndex version ${indexVersion} < ${IDENTIFICATION_INDEX_VERSION}`
        : "missing identificationIndex",
    );
  }
  if (pipelineVersion < CURRENT_PIPELINE_VERSION) {
    reasons.push(`pipelineVersion ${pipelineVersion} < ${CURRENT_PIPELINE_VERSION}`);
  }
  if (matchingVersion < CURRENT_MATCHING_VERSION) {
    reasons.push(`matchingVersion ${matchingVersion} < ${CURRENT_MATCHING_VERSION}`);
  }
  if (recognitionVersion < CURRENT_RECOGNITION_VERSION) {
    reasons.push(`recognitionVersion ${recognitionVersion} < ${CURRENT_RECOGNITION_VERSION}`);
  }

  const ready = reasons.length === 0;
  let aiStatus: AiStatus = ready ? AI_STATUS.READY : AI_STATUS.FAILED;
  if (
    !ready &&
    (pipelineVersion < CURRENT_PIPELINE_VERSION ||
      matchingVersion < CURRENT_MATCHING_VERSION ||
      recognitionVersion < CURRENT_RECOGNITION_VERSION)
  ) {
    aiStatus = AI_STATUS.STALE;
  }

  const contentHash =
    typeof indexFromGa?.contentHash === "string" ? indexFromGa.contentHash : null;

  const indexChecksum = computeIndexChecksum({
    itemId: row.itemId,
    pipelineVersion,
    recognitionVersion,
    matchingVersion,
    dominantColor,
    colourFamily,
    identificationContentHash: contentHash,
    signatureKeys: Object.entries(flags)
      .filter(([, v]) => v)
      .map(([k]) => k)
      .sort(),
  });

  return {
    ready,
    aiStatus: ready ? AI_STATUS.READY : aiStatus,
    reasons,
    flags,
    pipelineVersion,
    recognitionVersion,
    matchingVersion,
    colourFamily,
    dominantColor,
    indexChecksum,
  };
}

export async function assessInventoryProfile(itemId: number): Promise<ProfileReadinessResult | null> {
  const row = await prisma.inventoryAiProfile.findUnique({ where: { itemId } });
  if (!row) return null;
  const hasEmbeddingVector = await profileHasEmbeddingVector(itemId);
  const item = await prisma.clothingItem.findUnique({
    where: { id: itemId },
    select: { identificationIndex: true },
  });
  const itemIndex = asObject(item?.identificationIndex);
  const hasItemIndex =
    Array.isArray(itemIndex?.references) &&
    itemIndex!.references.length > 0 &&
    Number(itemIndex?.version || 0) === IDENTIFICATION_INDEX_VERSION;
  return evaluateProfileReadiness(row, {
    hasEmbeddingVector,
    hasIdentificationIndex:
      hasItemIndex ||
      (() => {
        const ga = asObject(row.garmentAttributes);
        const idx = asObject(ga?.identificationIndex);
        return (
          Array.isArray(idx?.references) &&
          idx!.references.length > 0 &&
          Number(idx?.version || 0) === IDENTIFICATION_INDEX_VERSION
        );
      })(),
  });
}

/** SQL predicate fragment: only fully READY searchable profiles. */
export function searchableProfileSql(alias = "p"): string {
  return `
    ${alias}.ai_status = 'READY'
    AND COALESCE(${alias}.needs_reindex, false) = false
    AND COALESCE(${alias}.has_embedding, false) = true
    AND COALESCE(${alias}.has_colour_data, false) = true
    AND COALESCE(${alias}.has_embroidery_signature, false) = true
    AND COALESCE(${alias}.has_border_signature, false) = true
    AND COALESCE(${alias}.has_motif_signature, false) = true
    AND COALESCE(${alias}.has_texture_signature, false) = true
    AND COALESCE(${alias}.has_panel_signature, false) = true
    AND COALESCE(${alias}.has_stone_signature, false) = true
    AND COALESCE(${alias}.has_identification_index, false) = true
    AND EXISTS (
      SELECT 1 FROM clothing_items ci
      WHERE ci.id = ${alias}.item_id
        AND COALESCE(NULLIF(regexp_replace(ci.identification_index->>'version', '[^0-9]', '', 'g'), ''), '0')::int
            >= ${IDENTIFICATION_INDEX_VERSION}
    )
    AND COALESCE(${alias}.matching_version, 0) >= ${CURRENT_MATCHING_VERSION}
    AND COALESCE(${alias}.recognition_version, 0) >= ${CURRENT_RECOGNITION_VERSION}
    AND COALESCE(NULLIF(regexp_replace(${alias}.pipeline_version, '[^0-9]', '', 'g'), ''), '0')::int
        >= ${CURRENT_PIPELINE_VERSION}
    AND ${alias}.embedding_vector IS NOT NULL
    AND ${alias}.dominant_color IS NOT NULL
    AND ${alias}.embroidery_signature IS NOT NULL
    AND ${alias}.border_signature IS NOT NULL
    AND ${alias}.motif_signature IS NOT NULL
    AND ${alias}.texture_signature IS NOT NULL
    AND ${alias}.panel_signature IS NOT NULL
    AND ${alias}.stone_signature IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM inventory_ai_fingerprints f
      WHERE f.item_id = ${alias}.item_id
        AND COALESCE(f.validation_status, 'VALID') = 'VALID'
    )
  `.replace(/\s+/g, " ").trim();
}

export function validationFlagsToPrisma(flags: ProfileValidationFlags): Prisma.InventoryAiProfileUpdateInput {
  return {
    hasEmbedding: flags.hasEmbedding,
    hasColourData: flags.hasColourData,
    hasEmbroiderySignature: flags.hasEmbroiderySignature,
    hasBorderSignature: flags.hasBorderSignature,
    hasMotifSignature: flags.hasMotifSignature,
    hasTextureSignature: flags.hasTextureSignature,
    hasPanelSignature: flags.hasPanelSignature,
    hasStoneSignature: flags.hasStoneSignature,
    hasIdentificationIndex: flags.hasIdentificationIndex,
  };
}
