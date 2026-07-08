import { Prisma } from "@prisma/client";
import prisma from "../prisma";
import { buildIdentificationIndex } from "../dressIdentificationIndex";
import { serializeStoredEmbeddings } from "../siglipModel";
import { SIGLIP_MODEL_ID } from "../siglipPreprocess";
import { saveRecognitionBuffer } from "../upload";
import { loadPhotoBuffer } from "../services/siglipSearch";
import { detectAndIsolateGarment } from "./imageProcessing";
import { extractFeatureFingerprint } from "./featureExtraction";
import { DRESS_CHECKER_FINGERPRINT_VERSION } from "./types";
import { DRESS_CHECKER_ENGINE_VERSION } from "./constants";
import {
  markProfileError,
  markProfileProcessing,
  saveInventoryIdentityProfile,
} from "./services/inventoryAiProfileService";

export { DRESS_CHECKER_FINGERPRINT_VERSION, DRESS_CHECKER_ENGINE_VERSION };

/** Scan inventory item → InventoryAiProfile (canonical) + legacy ClothingItem mirror. */
export async function processInventoryAiProfile(
  itemId: number,
  reason = "scheduled",
): Promise<boolean> {
  const item = await prisma.clothingItem.findUnique({
    where: { id: itemId },
    select: { id: true, name: true, color: true, category: true, subCategory: true, photo: true },
  });
  if (!item?.photo) return false;

  const rawBuf = await loadPhotoBuffer(item.photo);
  if (!rawBuf) return false;

  const started = Date.now();
  await markProfileProcessing(itemId);

  try {
    const garment = await detectAndIsolateGarment(rawBuf);
    const fingerprint = await extractFeatureFingerprint(
      garment,
      item.category,
      item.name,
      item.subCategory,
    );

    const recPath = await saveRecognitionBuffer(garment.buffer, itemId);

    const refPhotos = await prisma.clothingItemReferencePhoto.findMany({
      where: { itemId },
      orderBy: { sortOrder: "asc" },
      select: { photo: true, label: true, id: true },
    });

    const indexBuffers: Array<{ buffer: Buffer; refId: string; label: string }> = [
      { buffer: garment.buffer, refId: "primary", label: "primary" },
    ];

    for (const ref of refPhotos) {
      const refBuf = await loadPhotoBuffer(ref.photo);
      if (refBuf) {
        const refGarment = await detectAndIsolateGarment(refBuf);
        indexBuffers.push({
          buffer: refGarment.buffer,
          refId: `ref_${ref.id}`,
          label: ref.label || `reference_${ref.id}`,
        });
      }
    }

    const index = await buildIdentificationIndex(
      indexBuffers,
      item.category,
      item.name,
      item.color,
    );
    const legacyEmbeddings = index.references.map((r) => r.embeddings.global);
    const durationMs = Date.now() - started;

    await saveInventoryIdentityProfile({
      itemId,
      recognitionImage: recPath,
      fingerprint,
      identificationIndex: index,
      modelId: SIGLIP_MODEL_ID,
      reason,
      durationMs,
      imageCount: indexBuffers.length,
    });

    // Legacy mirror on ClothingItem for existing read paths — original photo untouched.
    await prisma.clothingItem.update({
      where: { id: itemId },
      data: {
        recognitionImage: recPath,
        identificationIndex: index,
        identificationIndexedAt: new Date(),
        siglipEmbedding: serializeStoredEmbeddings(legacyEmbeddings),
        siglipIndexedAt: new Date(),
      },
    });

    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI profile build failed";
    await markProfileError(itemId, message);
    throw err;
  }
}

const pending = new Set<number>();

export function scheduleInventoryAiProfile(itemId: number, reason = "photo_changed"): void {
  if (!itemId || pending.has(itemId)) return;
  pending.add(itemId);
  setImmediate(() => {
    void (async () => {
      try {
        await processInventoryAiProfile(itemId, reason);
      } catch (err) {
        console.error("[dress-checker-v5]", itemId, err);
      } finally {
        pending.delete(itemId);
      }
    })();
  });
}

export async function rebuildAllAiProfiles(force = false): Promise<{ processed: number; failed: number }> {
  const items = await prisma.clothingItem.findMany({
    where: force
      ? { photo: { not: null }, NOT: { photo: "" } }
      : {
          photo: { not: null },
          NOT: { photo: "" },
          OR: [
            { identificationIndexedAt: null },
            { aiProfile: { is: { recognitionVersion: { lt: DRESS_CHECKER_FINGERPRINT_VERSION } } } },
            { aiProfile: { is: null } },
          ],
        },
    select: { id: true },
    orderBy: { id: "asc" },
  });

  let processed = 0;
  let failed = 0;
  for (const item of items) {
    try {
      await processInventoryAiProfile(item.id, "bulk_rebuild");
      processed++;
    } catch {
      failed++;
    }
  }
  return { processed, failed };
}

export async function rebuildSelectedAiProfiles(itemIds: number[]): Promise<{ processed: number; failed: number }> {
  let processed = 0;
  let failed = 0;
  for (const id of itemIds) {
    try {
      await processInventoryAiProfile(id, "selected_rebuild");
      processed++;
    } catch {
      failed++;
    }
  }
  return { processed, failed };
}
