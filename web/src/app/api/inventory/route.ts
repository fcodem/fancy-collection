import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { createInventoryItemInTx } from "@/lib/services/inventoryOps";
import { jsonError, jsonOk, requireOwner, isResponse, requireOperationId } from "@/lib/api";
import { InventoryItemSchema } from "@/lib/validation";
import { photoUrl } from "@/lib/photoUrl";
import { computePipelineStatus, enqueueInventoryPhotoJobsDurable } from "@/lib/inventoryPhotoPipeline";
import { saveFastInventoryPhotoWithThumb } from "@/lib/upload";
import { broadcastShopEvent } from "@/lib/realtime/broadcast";
import { invalidateInventoryListCaches } from "@/lib/inventoryCacheTags";
import { logActivity, snapshotInventory } from "@/lib/activityLog";
import { createPerfTimer, withServerTiming } from "@/lib/perfTiming";
import prisma from "@/lib/prisma";
import { after } from "next/server";
import {
  assignScanCodeToInventory,
  generateInternalDressCode,
} from "@/lib/services/inventoryScanCode";
import {
  MutationIdempotencyError,
  claimMutationReceipt,
  completeMutationReceiptInTx,
  readMutationStaging,
  storeMutationStaging,
  toPublicErrorPayload,
} from "@/lib/mutationReceipt";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

async function fileContentHash(file: File): Promise<string> {
  const buf = Buffer.from(await file.arrayBuffer());
  return createHash("sha256").update(buf).digest("hex");
}

function validatedDirectBlobUrl(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      !url.hostname.endsWith(".public.blob.vercel-storage.com")
    ) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const perf = createPerfTimer("POST /api/inventory");
  perf.mark("auth");
  const user = await requireOwner();
  perf.endStage("authMs", "auth");
  if (isResponse(user)) return user;

  let uploadedPhotoPath: string | null = null;
  let uploadedThumbPath: string | null = null;
  let claimedOperationId: string | null = null;
  let committed = false;

  try {
    let form: FormData;
    try {
      perf.mark("parse");
      form = await req.formData();
      perf.endStage("parseMs", "parse");
    } catch {
      return jsonError(
        "Upload too large or incomplete. Use a smaller photo (under ~4 MB) and try again.",
        413,
      );
    }

    const operationIdOrErr = requireOperationId(form.get("operation_id"));
    if (isResponse(operationIdOrErr)) return operationIdOrErr;
    const operationId = operationIdOrErr;

    const photo = form.get("photo");
    const directPhotoPath = validatedDirectBlobUrl(form.get("photo_path"));
    const directThumbnailPath = validatedDirectBlobUrl(form.get("thumbnail_path"));
    const hasPhoto = (photo instanceof File && photo.size > 0) || Boolean(directPhotoPath);
    if (hasPhoto && process.env.VERCEL && !process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
      return jsonError(
        "Photo storage is not configured on this deployment. Set BLOB_READ_WRITE_TOKEN in Vercel Environment Variables (Production), then Redeploy.",
        500,
      );
    }

    const parseResult = InventoryItemSchema.omit({ sku: true }).safeParse({
      name: String(form.get("name") || ""),
      category: String(form.get("category") || ""),
      size: String(form.get("size") || "") || undefined,
      color: String(form.get("color") || "") || undefined,
      dailyRate: Number(form.get("daily_rate") || 0),
      deposit: Number(form.get("deposit") || 0),
    });
    if (!parseResult.success) {
      return jsonError(parseResult.error.issues[0]?.message || "Invalid input", 400);
    }

    const sizes = form.getAll("sizes[]").map(String);
    const photoHashFromClient = String(form.get("photo_content_hash") || "").trim() || null;
    const photoHash =
      photoHashFromClient || (hasPhoto ? await fileContentHash(photo as File) : null);

    const canonicalPayload = {
      name: String(form.get("name") || ""),
      category: String(form.get("category") || ""),
      sizes,
      size: String(form.get("size") || ""),
      color: String(form.get("color") || ""),
      daily_rate: Number(form.get("daily_rate") || 0),
      deposit: Number(form.get("deposit") || 0),
      quantity: Number(form.get("quantity") || 1),
      sub_category: String(form.get("sub_category") || "Normal"),
      condition_notes: String(form.get("condition_notes") || ""),
      has_necklace: form.get("has_necklace") === "1",
      has_earrings: form.get("has_earrings") === "1",
      has_teeka: form.get("has_teeka") === "1",
      has_pasa: form.get("has_pasa") === "1",
      photo_content_hash: photoHash,
      photo_path: directPhotoPath,
      thumbnail_path: directThumbnailPath,
    };

    // Claim BEFORE upload so completed retries never create orphan Blob files.
    const claim = await claimMutationReceipt({
      operationId,
      operationType: "inventory_create",
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
    const stagedThumb =
      typeof staging?.staging_thumbnail === "string" ? staging.staging_thumbnail : null;

    if (hasPhoto) {
      if (stagedPhoto) {
        uploadedPhotoPath = stagedPhoto;
        uploadedThumbPath = stagedThumb;
      } else if (directPhotoPath) {
        uploadedPhotoPath = directPhotoPath;
        uploadedThumbPath = directThumbnailPath;
        await storeMutationStaging(operationId, {
          staging_photo: uploadedPhotoPath,
          staging_thumbnail: uploadedThumbPath,
          photo_content_hash: photoHash,
        });
      } else {
        const saved = await saveFastInventoryPhotoWithThumb(photo as File);
        uploadedPhotoPath = saved.photo;
        uploadedThumbPath = saved.thumbnailPhoto;
        await storeMutationStaging(operationId, {
          staging_photo: uploadedPhotoPath,
          staging_thumbnail: uploadedThumbPath,
          photo_content_hash: photoHash,
        });
      }
    }

    const formInput = {
      name: String(form.get("name") || ""),
      category: String(form.get("category") || ""),
      sizes: sizes.length ? sizes : undefined,
      size: String(form.get("size") || ""),
      color: String(form.get("color") || ""),
      daily_rate: Number(form.get("daily_rate") || 0),
      deposit: Number(form.get("deposit") || 0),
      condition_notes: String(form.get("condition_notes") || ""),
      sub_category: String(form.get("sub_category") || "Normal"),
      quantity: Number(form.get("quantity") || 1),
      has_necklace: form.get("has_necklace") === "1",
      has_earrings: form.get("has_earrings") === "1",
      has_teeka: form.get("has_teeka") === "1",
      has_pasa: form.get("has_pasa") === "1",
    };

    const result = await prisma.$transaction(async (tx) => {
      const { items, inventoryGroupId } = await createInventoryItemInTx(
        tx,
        formInput,
        uploadedPhotoPath || "",
        uploadedThumbPath,
      );
      const primary = items[0];
      const pipeline = primary ? computePipelineStatus(primary) : null;
      const thumbRef = primary?.thumbnailPhoto || primary?.photo || null;
      const publicPayload = {
        ok: true as const,
        count: items.length,
        ids: items.map((i) => i.id),
        id: primary?.id,
        sku: primary?.sku ?? "",
        name: primary?.name ?? "",
        inventory_group_id: inventoryGroupId,
        primary_id: primary?.id,
        thumbnail_url: thumbRef ? photoUrl(thumbRef) : "",
        original_photo_url: primary ? photoUrl(primary.photo) : "",
        display_photo_url: pipeline?.display_photo_url || "",
        pipeline,
      };
      await completeMutationReceiptInTx(tx, operationId, publicPayload);
      return {
        ...publicPayload,
        _hasPhoto: Boolean(uploadedPhotoPath),
        _itemSnapshots: items.map((i) => ({
          id: i.id,
          name: i.name,
          category: i.category,
          size: i.size,
        })),
      };
    });
    committed = true;

    const { _hasPhoto: _a, _itemSnapshots: _b, ...publicResult } = result;
    const timings = perf.finish({ kind: "mutation" });

    after(async () => {
      invalidateInventoryListCaches();
      broadcastShopEvent({
        type: "inventory.changed",
        itemIds: result.ids,
        by: user.username,
      });
      for (const snap of result._itemSnapshots || []) {
        void logActivity({
          username: user.username,
          action: "created",
          entity: "inventory",
          entityId: snap.id,
          label: `Added ${snap.name} (${snap.category}, ${snap.size || "—"})`,
          after: snapshotInventory(snap as unknown as Record<string, unknown>),
        });
      }
      if (result._hasPhoto && result.ids.length) {
        try {
          await enqueueInventoryPhotoJobsDurable(result.ids, "photo_created");
        } catch (error) {
          console.error("[inventory POST] post-commit AI enqueue failed:", error);
        }
      }
      for (const id of result.ids) {
        try {
          await Promise.all([
            assignScanCodeToInventory(id, generateInternalDressCode(), "QR_CODE", "SYSTEM_GENERATED_QR"),
            assignScanCodeToInventory(id, generateInternalDressCode(), "CODE_128", "SYSTEM_GENERATED_BARCODE"),
          ]);
        } catch (e) {
          console.error("[inventory POST] auto scan-code generation failed for item", id, e);
        }
      }
    });

    return withServerTiming(jsonOk(publicResult), timings);
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
          data: {
            leaseExpiresAt: new Date(0),
            errorMessage: (e instanceof Error ? e.message : "mutation failed").slice(0, 500),
          },
        });
      } catch {
        /* ignore */
      }
    }
    const message = e instanceof Error ? e.message : "Failed to add item";
    console.error("[api/inventory POST]", message.slice(0, 200));
    return jsonError(message, 500);
  }
}
