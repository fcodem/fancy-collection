import { createHash } from "crypto";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { DRESS_CHECKER_FINGERPRINT_VERSION, type FeatureFingerprint } from "./types";
import { buildInventorySignatures, type InventorySignatures } from "./inventorySignatures";
import { buildBridalIdentityHashes, detectBridalMotifs } from "./bridalIdentityHashes";

export const INVENTORY_AI_FINGERPRINT_VERSION = 1;
export const DETERMINISTIC_FINGERPRINT_PROMPT_VERSION = "deterministic_v1";

const FingerprintSchema = z.object({
  primaryColor: z.string(),
  secondaryColors: z.array(z.string()),
  colorFamilies: z.array(z.string()),
  embroideryDensity: z.string(),
  embroideryStyle: z.string(),
  motifs: z.array(z.string()),
  motifCount: z.number().int().min(0),
  motifPositions: z.array(
    z.object({
      motif: z.string(),
      x: z.number().min(0).max(1).optional(),
      y: z.number().min(0).max(1).optional(),
      strength: z.number().min(0).max(1).optional(),
    }),
  ),
  panelCount: z.number().int().min(0),
  panelSequence: z.array(z.string()),
  borderType: z.string(),
  borderPatterns: z.array(z.string()),
  blouseStyle: z.string(),
  dupattaStyle: z.string(),
  silhouette: z.string(),
  uniqueIdentifiers: z.array(z.string()),
  stoneWork: z.boolean(),
  mirrorWork: z.boolean(),
  zariWork: z.boolean(),
  threadWork: z.boolean(),
  confidence: z.number().min(0).max(100),
  gptDescription: z.string(),
});

export type InventoryAiFingerprintPayload = z.infer<typeof FingerprintSchema>;

function densityLabel(value: number): string {
  if (value >= 70) return "very_high";
  if (value >= 45) return "high";
  if (value >= 20) return "medium";
  return "low";
}

function estimatePanelCount(fp: FeatureFingerprint): number {
  const motifPeaks = fp.motifDistribution.filter((v) => v > 0.18).length;
  if (motifPeaks >= 4) return motifPeaks * 2;
  if (/lehenga|skirt/i.test(`${fp.category} ${fp.subCategory}`)) return 8;
  return 0;
}

function uniqueIdentifiersFrom(fp: FeatureFingerprint, signatures: InventorySignatures): string[] {
  const ids = new Set<string>();
  if (fp.borderPattern.differenceHash) ids.add(`border:${fp.borderPattern.differenceHash.slice(0, 12)}`);
  if (signatures.bridalHashes.borderFingerprint) {
    ids.add(`borderFp:${signatures.bridalHashes.borderFingerprint.slice(0, 12)}`);
  }
  if (signatures.bridalHashes.motifFingerprint) {
    ids.add(`motifFp:${signatures.bridalHashes.motifFingerprint.slice(0, 12)}`);
  }
  if (fp.stoneWork) ids.add("stone-work");
  if (fp.mirrorWork) ids.add("mirror-work");
  if (fp.dupattaBorder) ids.add(`dupatta:${fp.dupattaBorder}`);
  return [...ids];
}

export function hashImageBuffer(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function buildDeterministicInventoryAiFingerprint(
  fp: FeatureFingerprint,
): InventoryAiFingerprintPayload {
  const signatures = buildInventorySignatures(fp);
  const bridalHashes = buildBridalIdentityHashes(fp);
  const motifs = detectBridalMotifs(fp).filter((m) => m.kind !== "unknown");
  const motifTypes = motifs.length
    ? motifs.map((m) => m.kind)
    : fp.motifDistribution.some((v) => v > 0.4)
      ? ["floral"]
      : [];
  const panelCount = estimatePanelCount(fp);
  const panelSequence = [
    panelCount ? `panels:${panelCount}` : null,
    bridalHashes.panelSequenceHash ? `panelHash:${bridalHashes.panelSequenceHash.slice(0, 12)}` : null,
    fp.garmentShape || null,
  ].filter(Boolean) as string[];

  const payload: InventoryAiFingerprintPayload = {
    primaryColor: fp.primaryColour || "unknown",
    secondaryColors: [fp.secondaryColour, ...(fp.accentColours ?? [])].filter(Boolean),
    colorFamilies: [...new Set([fp.colourFamily].filter(Boolean))],
    embroideryDensity: densityLabel(fp.embroideryDensity),
    embroideryStyle: fp.embroideryStyle || "unknown",
    motifs: [...new Set(motifTypes)],
    motifCount: motifs.reduce((sum, m) => sum + Math.max(1, m.count), 0),
    motifPositions: motifs.flatMap((m) =>
      m.positions.slice(0, 12).map((p) => ({
        motif: m.kind,
        x: Math.round(p.x * 100) / 100,
        y: Math.round(p.y * 100) / 100,
        strength: Math.round(p.strength * 100) / 100,
      })),
    ),
    panelCount,
    panelSequence,
    borderType: fp.borderPattern.widthRatio >= 0.18 ? "heavy_border" : "standard_border",
    borderPatterns: [
      fp.borderPattern.averageHash ? `ah:${fp.borderPattern.averageHash}` : "",
      fp.borderPattern.differenceHash ? `dh:${fp.borderPattern.differenceHash}` : "",
      `width:${Math.round(fp.borderPattern.widthRatio * 100) / 100}`,
    ].filter(Boolean),
    blouseStyle: [fp.necklineShape, fp.sleeveLength].filter(Boolean).join(" / ") || "unknown",
    dupattaStyle: [fp.dupattaPattern, fp.dupattaBorder].filter(Boolean).join(" / ") || "unknown",
    silhouette: fp.silhouette || fp.garmentShape || "unknown",
    uniqueIdentifiers: uniqueIdentifiersFrom(fp, signatures),
    stoneWork: fp.stoneWork,
    mirrorWork: fp.mirrorWork,
    zariWork: fp.threadPattern.some((v) => v > 0.55),
    threadWork: fp.threadPattern.some((v) => v > 0.15),
    confidence: Math.max(55, Math.min(92, Math.round(fp.qualityScore || 75))),
    gptDescription: "Deterministic fingerprint generated from local v9 signatures.",
  };

  return FingerprintSchema.parse(payload);
}

export function validateInventoryAiFingerprintPayload(
  payload: unknown,
): { ok: true; data: InventoryAiFingerprintPayload } | { ok: false; errors: string[] } {
  const parsed = FingerprintSchema.safeParse(payload);
  if (parsed.success) return { ok: true, data: parsed.data };
  return {
    ok: false,
    errors: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
  };
}

export async function upsertInventoryAiFingerprint(input: {
  itemId: number;
  imageHash: string;
  sourceImage?: string | null;
  fingerprint: InventoryAiFingerprintPayload;
  deterministicJson?: unknown;
  rawStructuredJson?: unknown;
  model?: string | null;
  promptVersion?: string;
}): Promise<void> {
  const validation = validateInventoryAiFingerprintPayload(input.fingerprint);
  if (!validation.ok) {
    throw new Error(`Invalid inventory AI fingerprint: ${validation.errors.join("; ")}`);
  }
  const fp = validation.data;
  const now = new Date();
  await prisma.$executeRaw`
    INSERT INTO inventory_ai_fingerprints (
      item_id, input_image_hash, source_image, fingerprint_version,
      primary_color, secondary_colors, color_families,
      embroidery_density, embroidery_style, motifs, motif_count, motif_positions,
      panel_count, panel_sequence, border_type, border_patterns,
      blouse_style, dupatta_style, silhouette, unique_identifiers,
      stone_work, mirror_work, zari_work, thread_work,
      confidence, gpt_description, raw_structured_json, deterministic_json, raw_json,
      model, prompt_version, validation_status, validation_errors, extracted_at, created_at, updated_at
    ) VALUES (
      ${input.itemId}, ${input.imageHash}, ${input.sourceImage ?? null}, ${INVENTORY_AI_FINGERPRINT_VERSION},
      ${fp.primaryColor}, ${JSON.stringify(fp.secondaryColors)}::jsonb, ${JSON.stringify(fp.colorFamilies)}::jsonb,
      ${fp.embroideryDensity}, ${fp.embroideryStyle}, ${JSON.stringify(fp.motifs)}::jsonb, ${fp.motifCount}, ${JSON.stringify(fp.motifPositions)}::jsonb,
      ${fp.panelCount}, ${JSON.stringify(fp.panelSequence)}::jsonb, ${fp.borderType}, ${JSON.stringify(fp.borderPatterns)}::jsonb,
      ${fp.blouseStyle}, ${fp.dupattaStyle}, ${fp.silhouette}, ${JSON.stringify(fp.uniqueIdentifiers)}::jsonb,
      ${fp.stoneWork}, ${fp.mirrorWork}, ${fp.zariWork}, ${fp.threadWork},
      ${fp.confidence}, ${fp.gptDescription}, ${JSON.stringify(input.rawStructuredJson ?? fp)}::jsonb,
      ${JSON.stringify(input.deterministicJson ?? fp)}::jsonb, ${JSON.stringify(fp)}::jsonb,
      ${input.model ?? "deterministic"}, ${input.promptVersion ?? DETERMINISTIC_FINGERPRINT_PROMPT_VERSION},
      ${"VALID"}, ${JSON.stringify([])}::jsonb, ${now}, ${now}, ${now}
    )
    ON CONFLICT (item_id, input_image_hash, fingerprint_version) DO UPDATE SET
      source_image = EXCLUDED.source_image,
      primary_color = EXCLUDED.primary_color,
      secondary_colors = EXCLUDED.secondary_colors,
      color_families = EXCLUDED.color_families,
      embroidery_density = EXCLUDED.embroidery_density,
      embroidery_style = EXCLUDED.embroidery_style,
      motifs = EXCLUDED.motifs,
      motif_count = EXCLUDED.motif_count,
      motif_positions = EXCLUDED.motif_positions,
      panel_count = EXCLUDED.panel_count,
      panel_sequence = EXCLUDED.panel_sequence,
      border_type = EXCLUDED.border_type,
      border_patterns = EXCLUDED.border_patterns,
      blouse_style = EXCLUDED.blouse_style,
      dupatta_style = EXCLUDED.dupatta_style,
      silhouette = EXCLUDED.silhouette,
      unique_identifiers = EXCLUDED.unique_identifiers,
      stone_work = EXCLUDED.stone_work,
      mirror_work = EXCLUDED.mirror_work,
      zari_work = EXCLUDED.zari_work,
      thread_work = EXCLUDED.thread_work,
      confidence = EXCLUDED.confidence,
      gpt_description = EXCLUDED.gpt_description,
      raw_structured_json = EXCLUDED.raw_structured_json,
      deterministic_json = EXCLUDED.deterministic_json,
      raw_json = EXCLUDED.raw_json,
      model = EXCLUDED.model,
      prompt_version = EXCLUDED.prompt_version,
      validation_status = EXCLUDED.validation_status,
      validation_errors = EXCLUDED.validation_errors,
      extracted_at = EXCLUDED.extracted_at,
      updated_at = EXCLUDED.updated_at
  `;
}

