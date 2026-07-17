import { NextRequest } from "next/server";
import { createHash } from "crypto";
import prisma from "@/lib/prisma";
import { updateInventoryItemInTx, deleteInventoryItem } from "@/lib/services/inventoryOps";
import { dressDisplayName } from "@/lib/dress";
import { catalogPhotoUrl, recognitionPhotoUrl } from "@/lib/catalogPhotoUrl";
import { photoUrl } from "@/lib/photoUrl";
import { computePipelineStatus, enqueueInventoryPhotoJobsDurable } from "@/lib/inventoryPhotoPipeline";
import { saveFastInventoryPhoto } from "@/lib/upload";
import { enqueueBlobCleanup } from "@/lib/blobCleanup";
import { broadcastShopEvent } from "@/lib/realtime/broadcast";
import { logActivity, snapshotInventory } from "@/lib/activityLog";
import { onInventoryPhotoRemoved } from "@/lib/dressCheckerIndexing";
import {
  jsonError,
  jsonOk,
  requireOwner,
  requireUser,
  isResponse,
  requireOperationId,
} from "@/lib/api";
import {
  MutationIdempotencyError,
  claimMutationReceipt,
  completeMutationReceiptInTx,
  readMutationStaging,
  storeMutationStaging,
  toPublicErrorPayload,
} from "@/lib/mutationReceipt";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id } = await params;
  const item = await prisma.clothingItem.findUnique({ where: { id: parseInt(id, 10) } });
  if (!item) return jsonError("Not found", 404);
  return jsonOk({
    ...item,
    display_name: dressDisplayName(item.name, item.category, item.size),
    photo_url: catalogPhotoUrl(item),
    recognition_photo_url: recognitionPhotoUrl(item),
    original_photo_url: photoUrl(item.photo),
  });
}

async function fileContentHash(file: File): Promise<string> {
  const buf = Buffer.from(await file.arrayBuffer());
  return createHash("sha256").update(buf).digest("hex");
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireOwner();
  if (isResponse(user)) return user;
  const { id } = await params;
  const itemId = parseInt(id, 10);

  let claimedOperationId: string | null = null;
  let committed = false;
  let stagedPhotoPath: string | null = null;

  try {
    const form = await req.formData();
    const operationIdOrErr = requireOperationId(form.get("operation_id"));
    if (isResponse(operationIdOrErr)) return operationIdOrErr;
    const operationId = operationIdOrErr;

    const photo = form.get("photo");
    const hasPhoto = photo instanceof File && photo.size > 0;
    const removePhoto = form.get("remove_photo") === "1";
    const photoHashFromClient = String(form.get("photo_content_hash") || "").trim() || null;
    const photoHash =
      photoHashFromClient || (hasPhoto ? await fileContentHash(photo as File) : null);

    const canonicalPayload = {
      itemId,
      name: String(form.get("name") || ""),
      category: String(form.get("category") || ""),
      size: String(form.get("size") || ""),
      color: String(form.get("color") || ""),
      daily_rate: Number(form.get("daily_rate") || 0),
      deposit: Number(form.get("deposit") || 0),
      condition_notes: String(form.get("condition_notes") || ""),
      status: String(form.get("status") || ""),
      sub_category: String(form.get("sub_category") || "Normal"),
      remove_photo: removePhoto,
      has_necklace: form.get("has_necklace") === "1",
      has_earrings: form.get("has_earrings") === "1",
      has_teeka: form.get("has_teeka") === "1",
      has_pasa: form.get("has_pasa") === "1",
      photo_content_hash: photoHash,
    };

    // Claim BEFORE upload so completed retries never create orphan Blob files.
    const claim = await claimMutationReceipt({
      operationId,
      operationType: "inventory_update",
      actorUserId: user.id,
      payload: canonicalPayload,
    });
    if (claim.kind === "reuse") {
      return jsonOk({ ...(claim.result as object), reused: true });
    }
    claimedOperationId = claim.operationId;

    const staging = await readMutationStaging(operationId);
    const stagedPhoto =
      typeof staging?.staging_photo === "string" ? staging.staging_photo : null;

    if (hasPhoto && !removePhoto) {
      if (stagedPhoto) {
        stagedPhotoPath = stagedPhoto;
      } else {
        stagedPhotoPath = await saveFastInventoryPhoto(photo as File);
        await storeMutationStaging(operationId, {
          staging_photo: stagedPhotoPath,
          photo_content_hash: photoHash,
        });
      }
    }

    const formInput = {
      name: String(form.get("name") || ""),
      category: String(form.get("category") || ""),
      size: String(form.get("size") || ""),
      color: String(form.get("color") || ""),
      daily_rate: Number(form.get("daily_rate") || 0),
      deposit: Number(form.get("deposit") || 0),
      condition_notes: String(form.get("condition_notes") || ""),
      status: String(form.get("status") || ""),
      sub_category: String(form.get("sub_category") || "Normal"),
      remove_photo: removePhoto,
      has_necklace: form.get("has_necklace") === "1",
      has_earrings: form.get("has_earrings") === "1",
      has_teeka: form.get("has_teeka") === "1",
      has_pasa: form.get("has_pasa") === "1",
    };

    const result = await prisma.$transaction(async (tx) => {
      const { updated, uploadsToDelete, beforeSnapshot, photoReplaced, photoRemoved } =
        await updateInventoryItemInTx(tx, itemId, formInput, stagedPhotoPath);
      const pipeline = computePipelineStatus(updated);
      const payload = {
        ok: true as const,
        id: updated.id,
        original_photo_url: photoUrl(updated.photo),
        display_photo_url: pipeline.display_photo_url,
        pipeline,
        _uploadsToDelete: uploadsToDelete,
        _beforeSnapshot: beforeSnapshot,
        _photoReplaced: photoReplaced,
        _photoRemoved: photoRemoved,
        _name: updated.name,
        _category: updated.category,
        _hasPhoto: Boolean(updated.photo),
      };
      await completeMutationReceiptInTx(tx, operationId, {
        ok: true,
        id: updated.id,
        original_photo_url: payload.original_photo_url,
        display_photo_url: payload.display_photo_url,
        pipeline: payload.pipeline,
      });
      return payload;
    });
    committed = true;

    if (result._uploadsToDelete.length) {
      await enqueueBlobCleanup(result._uploadsToDelete, { reason: "inventory_photo_replaced" });
    }
    broadcastShopEvent({ type: "inventory.changed", itemIds: [itemId], by: user.username });
    void logActivity({
      username: user.username,
      action: "updated",
      entity: "inventory",
      entityId: itemId,
      label: `Updated ${result._name} (${result._category})`,
      before: result._beforeSnapshot,
      after: snapshotInventory({
        id: result.id,
        name: result._name,
        category: result._category,
      } as unknown as Record<string, unknown>),
    });
    if (result._photoRemoved) {
      onInventoryPhotoRemoved(itemId);
    } else if (result._hasPhoto && result._photoReplaced) {
      try {
        await enqueueInventoryPhotoJobsDurable([itemId], "photo_replaced");
      } catch (e) {
        console.error("[inventory PUT] AI enqueue failed:", e);
      }
    }

    const {
      _uploadsToDelete: _a,
      _beforeSnapshot: _b,
      _photoReplaced: _c,
      _photoRemoved: _d,
      _name: _e,
      _category: _f,
      _hasPhoto: _g,
      ...publicResult
    } = result;
    return jsonOk(publicResult);
  } catch (e) {
    if (e instanceof MutationIdempotencyError) {
      const pub = toPublicErrorPayload(e);
      return jsonError(pub.error, e.httpStatus, { code: pub.code, retryable: pub.retryable });
    }
    if (claimedOperationId && !committed) {
      // Keep receipt reclaimable with staging_photo intact — do not mark failed
      // and do not delete the staged upload (retry reuses it).
      try {
        await prisma.mutationReceipt.update({
          where: { operationId: claimedOperationId },
          data: { leaseExpiresAt: new Date(0) },
        });
      } catch {
        /* ignore */
      }
    }
    return jsonError(e instanceof Error ? e.message : "Update failed");
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireOwner();
  if (isResponse(user)) return user;
  const { id } = await params;
  try {
    await deleteInventoryItem(parseInt(id, 10), user.username);
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Delete failed");
  }
}
