import { Prisma } from "@prisma/client";
import prisma from "../prisma";
import { serializeStoredEmbeddings } from "../siglipModel";
import { saveRecognitionBuffer } from "../upload";
import { DRESS_CHECKER_FINGERPRINT_VERSION } from "./types";
import { DRESS_CHECKER_ENGINE_VERSION } from "./constants";
import { saveInventoryIdentityProfile } from "./services/inventoryAiProfileService";
import {
  buildEnterpriseIndex,
  persistReferencePhotoEmbeddings,
  ENTERPRISE_MATCHING_VERSION,
} from "./enterpriseIndexing";
import {
  finalizeProfileAfterIndex,
  markProfileFailed,
  markProfileProcessing,
} from "./profileLifecycle";
import {
  buildDeterministicInventoryAiFingerprint,
  hashImageBuffer,
  upsertInventoryAiFingerprint,
} from "./inventoryAiFingerprint";
import { indexImageBuffers } from "./indexingService";
import { enqueueInventoryAiJob } from "./aiJobQueue";

export { DRESS_CHECKER_FINGERPRINT_VERSION, DRESS_CHECKER_ENGINE_VERSION };

/**
 * Full enterprise index for one inventory item.
 * Ends ONLY in READY (validated) or FAILED (rolled back). Never partial.
 * Called by the durable job worker — not from HTTP request handlers.
 */
export async function processInventoryAiProfile(
  itemId: number,
  reason = "scheduled",
): Promise<boolean> {
  const item = await prisma.clothingItem.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      name: true,
      color: true,
      category: true,
      subCategory: true,
      photo: true,
    },
  });
  if (!item?.photo) {
    await markProfileFailed(itemId, "No catalog photo", { rollback: true });
    return false;
  }

  const started = Date.now();
  await markProfileProcessing(itemId);

  try {
    const refPhotos = await prisma.clothingItemReferencePhoto.findMany({
      where: { itemId },
      orderBy: { sortOrder: "asc" },
      select: { id: true, photo: true, label: true },
    });

    const indexResult = await buildEnterpriseIndex(
      itemId,
      item.photo,
      {
        name: item.name,
        color: item.color,
        category: item.category,
        subCategory: item.subCategory,
      },
      refPhotos,
    );

    if (!indexResult) {
      await markProfileFailed(itemId, "Enterprise index returned null (photo load/isolate failed)", {
        rollback: true,
      });
      return false;
    }

    if (!indexResult.identificationIndex.references?.length) {
      await markProfileFailed(itemId, "identificationIndex has no references", { rollback: true });
      return false;
    }

    if (!indexResult.fingerprint.primaryColour || !indexResult.fingerprint.colourFamily) {
      await markProfileFailed(itemId, "Colour diagnostics incomplete", { rollback: true });
      return false;
    }

    const sigs = indexResult.signatures;
    if (
      !sigs?.embroidery ||
      !sigs?.border ||
      !sigs?.motif ||
      !sigs?.texture ||
      !sigs?.panel ||
      !sigs?.stone ||
      !sigs?.dominantColor
    ) {
      await markProfileFailed(itemId, "Enterprise signatures incomplete", { rollback: true });
      return false;
    }

    const recPath = await saveRecognitionBuffer(indexResult.garmentBuffer, itemId);
    const durationMs = Date.now() - started;
    const legacyEmbeddings = indexResult.identificationIndex.references.map((r) => r.embeddings.global);

    await saveInventoryIdentityProfile({
      itemId,
      recognitionImage: recPath,
      fingerprint: indexResult.fingerprint,
      identificationIndex: indexResult.identificationIndex,
      modelId: indexResult.identificationIndex.modelId,
      reason,
      durationMs,
      imageCount: indexResult.imageCount,
      signatures: indexResult.signatures,
      matchingVersion: ENTERPRISE_MATCHING_VERSION,
      draftOnly: true,
    });

    await indexImageBuffers(itemId, indexResult.garmentBuffer, reason);
    await prisma.inventoryAiProfile.update({
      where: { itemId },
      data: { hasEmbedding: true },
    });

    if (indexResult.referenceEmbeddings.length) {
      await persistReferencePhotoEmbeddings(indexResult.referenceEmbeddings);
    }

    // Permanent deterministic fingerprint (no OpenAI spend, strict schema validated).
    const imageHash = hashImageBuffer(indexResult.garmentBuffer);
    const deterministicFingerprint = buildDeterministicInventoryAiFingerprint(indexResult.fingerprint);
    await upsertInventoryAiFingerprint({
      itemId,
      imageHash,
      sourceImage: item.photo,
      fingerprint: deterministicFingerprint,
      deterministicJson: {
        featureVersion: DRESS_CHECKER_FINGERPRINT_VERSION,
        engineVersion: DRESS_CHECKER_ENGINE_VERSION,
        signatures: indexResult.signatures,
      },
    });

    // Optional OpenAI semantic enrichment (once; never on every search).
    try {
      const { ensureInventoryAiFingerprint } = await import("./openaiBridalForensics");
      await ensureInventoryAiFingerprint(itemId, indexResult.garmentBuffer, {
        imageHash,
        sourceImage: item.photo,
      });
    } catch (err) {
      console.warn(
        `[dress-checker] GPT fingerprint skipped item=${itemId}:`,
        err instanceof Error ? err.message : err,
      );
    }

    const finalized = await finalizeProfileAfterIndex(itemId);
    if (!finalized.ok) {
      console.error(
        `[dress-checker] item=${itemId} FAILED validation: ${finalized.reasons.join("; ")}`,
      );
      return false;
    }

    await prisma.clothingItem.update({
      where: { id: itemId },
      data: {
        recognitionImage: recPath,
        identificationIndex: indexResult.identificationIndex as unknown as Prisma.InputJsonValue,
        identificationIndexedAt: new Date(),
        siglipEmbedding: serializeStoredEmbeddings(legacyEmbeddings),
        siglipIndexedAt: new Date(),
      },
    });

    console.log(`[dress-checker] item=${itemId} READY ms=${Date.now() - started} reason=${reason}`);
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI profile build failed";
    await markProfileFailed(itemId, message, { rollback: true });
    throw err;
  }
}

/** Enqueue durable AI job — returns immediately (never blocks HTTP). */
export function scheduleInventoryAiProfile(itemId: number, reason = "photo_changed"): void {
  if (!itemId) return;
  void enqueueInventoryAiJob({
    itemId,
    reason,
    staleExisting:
      reason.includes("photo") || reason.includes("replaced") || reason.includes("created"),
    priority: reason.includes("repair") ? 50 : 100,
  }).catch((err) => {
    console.error("[dress-checker] enqueue failed", itemId, err);
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
            { aiProfile: { is: { matchingVersion: { lt: DRESS_CHECKER_ENGINE_VERSION } } } },
            { aiProfile: { is: { aiStatus: { not: "READY" } } } },
            { aiProfile: { is: { needsReindex: true } } },
            { aiProfile: { is: null } },
          ],
        },
    select: { id: true },
    orderBy: { id: "asc" },
  });

  let processed = 0;
  for (const item of items) {
    await enqueueInventoryAiJob({
      itemId: item.id,
      reason: force ? "bulk_rebuild_full" : "bulk_rebuild",
      priority: 80,
      staleExisting: true,
    });
    processed++;
  }
  return { processed, failed: 0 };
}

export async function rebuildSelectedAiProfiles(
  itemIds: number[],
): Promise<{ processed: number; failed: number }> {
  let processed = 0;
  for (const id of itemIds) {
    await enqueueInventoryAiJob({
      itemId: id,
      reason: "selected_rebuild",
      priority: 60,
      staleExisting: true,
    });
    processed++;
  }
  return { processed, failed: 0 };
}
