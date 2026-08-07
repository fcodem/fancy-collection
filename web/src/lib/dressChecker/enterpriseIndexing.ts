/**
 * Enterprise dress checker indexing pipeline (STEP 1–4).
 *
 * 1. Background removal
 * 2. Dress-only crop
 * 3. Orientation normalization
 * 4. Persist embeddings + colour + signatures + matching_version
 *
 * Also indexes staff reference photos (hanger / mannequin / outdoor / etc.)
 * and synthetic orientation variants from the primary photo so Dress Search
 * works across angles even when only one catalog shot exists.
 */
import sharp from "sharp";
import prisma from "../prisma";
import { buildIdentificationIndex } from "../dressIdentificationIndex";
import { loadPhotoBuffer } from "../services/siglipSearch";
import { detectAndIsolateGarment } from "./imageProcessing";
import { extractFeatureFingerprint } from "./featureExtraction";
import { generateIndexEmbedding } from "./indexingService";
import { buildInventorySignatures } from "./inventorySignatures";
import {
  DRESS_CHECKER_ENGINE_VERSION,
  INDEX_SYNTHETIC_ROTATION_DEGREES,
} from "./constants";
import { upsertReferencePhotoEmbeddingVector } from "@/lib/ai/pgvector";
import type { FeatureFingerprint } from "./types";
import type { IdentificationIndex } from "../dressIdentificationTypes";

export type ReferenceIndexBuffer = {
  buffer: Buffer;
  refId: string;
  label: string;
  refPhotoId?: number;
};

export type EnterpriseIndexResult = {
  garmentBuffer: Buffer;
  fingerprint: FeatureFingerprint;
  identificationIndex: IdentificationIndex;
  signatures: ReturnType<typeof buildInventorySignatures>;
  primaryEmbedding: number[];
  referenceEmbeddings: Array<{
    refPhotoId: number;
    label: string;
    embedding: number[];
    regionEmbeddings?: IdentificationIndex["references"][number]["embeddings"];
    regionSignatures?: ReturnType<typeof buildInventorySignatures>;
  }>;
  imageCount: number;
};

async function embedGarmentBuffer(buffer: Buffer, itemId: number, label: string): Promise<number[]> {
  try {
    return await generateIndexEmbedding(buffer, itemId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "embedding failed";
    console.warn(`[enterprise-index] embedding failed item=${itemId} ref=${label}: ${msg}`);
    return [];
  }
}

/** Build rotated variants of the primary garment for angle-robust indexing. */
async function buildSyntheticOrientationBuffers(
  primaryBuffer: Buffer,
): Promise<ReferenceIndexBuffer[]> {
  const out: ReferenceIndexBuffer[] = [];
  for (const deg of INDEX_SYNTHETIC_ROTATION_DEGREES) {
    try {
      const rotated = await sharp(primaryBuffer)
        .rotate(deg)
        .jpeg({ quality: 92 })
        .toBuffer();
      out.push({
        buffer: rotated,
        refId: `primary_rot${deg}`,
        label: `synthetic_rot${deg}`,
      });
    } catch (err) {
      console.warn(
        `[enterprise-index] synthetic rot${deg} skipped:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  return out;
}

/** Run garment isolation + fingerprint + multi-view index for one inventory item. */
export async function buildEnterpriseIndex(
  itemId: number,
  photo: string,
  meta: { name: string; color: string | null; category: string; subCategory: string | null },
  referencePhotos: Array<{ id: number; photo: string; label: string | null }>,
): Promise<EnterpriseIndexResult | null> {
  const rawBuf = await loadPhotoBuffer(photo);
  if (!rawBuf) return null;

  const garment = await detectAndIsolateGarment(rawBuf);
  const fingerprint = await extractFeatureFingerprint(
    garment,
    meta.category,
    meta.name,
    meta.subCategory,
  );

  const indexBuffers: ReferenceIndexBuffer[] = [
    { buffer: garment.buffer, refId: "primary", label: "primary" },
  ];

  for (const ref of referencePhotos) {
    const refBuf = await loadPhotoBuffer(ref.photo);
    if (!refBuf) continue;
    try {
      const refGarment = await detectAndIsolateGarment(refBuf);
      indexBuffers.push({
        buffer: refGarment.buffer,
        refId: `ref_${ref.id}`,
        label: ref.label || `reference_${ref.id}`,
        refPhotoId: ref.id,
      });
    } catch (err) {
      console.warn(
        `[enterprise-index] reference ${ref.id} skipped:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  // When staff have not uploaded many angles yet, synthesize orientation views
  // from the primary photo so hanger / side / inverted queries still match.
  const realRefCount = referencePhotos.length;
  if (realRefCount < 3) {
    const synthetics = await buildSyntheticOrientationBuffers(garment.buffer);
    indexBuffers.push(...synthetics);
  }

  const identificationIndex = await buildIdentificationIndex(
    indexBuffers.map((b) => ({ buffer: b.buffer, refId: b.refId, label: b.label })),
    meta.category,
    meta.name,
    meta.color,
  );

  const referenceEmbeddings: EnterpriseIndexResult["referenceEmbeddings"] = [];
  for (const buf of indexBuffers) {
    if (!buf.refPhotoId) continue;
    const embedding = await embedGarmentBuffer(buf.buffer, itemId, buf.label);
    if (!embedding.length) continue;
    const indexRef = identificationIndex.references.find(
      (r) => r.refId === buf.refId || r.label === buf.label,
    );
    let regionSignatures: ReturnType<typeof buildInventorySignatures> | undefined;
    try {
      const refGarment = await detectAndIsolateGarment(buf.buffer);
      const refFp = await extractFeatureFingerprint(
        refGarment,
        meta.category,
        meta.name,
        meta.subCategory,
      );
      regionSignatures = buildInventorySignatures(refFp);
    } catch {
      regionSignatures = undefined;
    }
    referenceEmbeddings.push({
      refPhotoId: buf.refPhotoId,
      label: buf.label,
      embedding,
      regionEmbeddings: indexRef?.embeddings,
      regionSignatures,
    });
  }

  // Also embed primary into clothing item via identificationIndex (handled by caller).
  const primaryEmbedding = await embedGarmentBuffer(garment.buffer, itemId, "primary");

  return {
    garmentBuffer: garment.buffer,
    fingerprint,
    identificationIndex,
    signatures: buildInventorySignatures(fingerprint),
    primaryEmbedding,
    referenceEmbeddings,
    imageCount: indexBuffers.length,
  };
}

/** Persist reference photo embeddings + multi-region bags for cross-view ANN. */
export async function persistReferencePhotoEmbeddings(
  referenceEmbeddings: EnterpriseIndexResult["referenceEmbeddings"],
): Promise<void> {
  const now = new Date();
  for (const ref of referenceEmbeddings) {
    await upsertReferencePhotoEmbeddingVector(ref.refPhotoId, ref.embedding);
    await prisma.clothingItemReferencePhoto.update({
      where: { id: ref.refPhotoId },
      data: {
        embeddingJson: ref.embedding,
        lastIndexedAt: now,
        indexedAt: now,
        ...(ref.regionEmbeddings
          ? { regionEmbeddings: ref.regionEmbeddings as object }
          : {}),
        ...(ref.regionSignatures
          ? { regionSignatures: ref.regionSignatures as object }
          : {}),
      },
    });
  }
}

export const ENTERPRISE_MATCHING_VERSION = DRESS_CHECKER_ENGINE_VERSION;
