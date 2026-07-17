import { NextRequest, after } from "next/server";
import { createHash } from "crypto";
import { createInventoryItemInTx } from "@/lib/services/inventoryOps";
import { jsonError, jsonOk, requireOwner, isResponse, requireOperationId } from "@/lib/api";
import { InventoryItemSchema } from "@/lib/validation";
import { photoUrl } from "@/lib/photoUrl";
import { computePipelineStatus, enqueueInventoryPhotoJobsDurable } from "@/lib/inventoryPhotoPipeline";
import { saveFastInventoryPhoto } from "@/lib/upload";
import { enqueueBlobCleanup } from "@/lib/blobCleanup";
import { broadcastShopEvent } from "@/lib/realtime/broadcast";
import { logActivity, snapshotInventory } from "@/lib/activityLog";
import {
  MutationIdempotencyError,
  runIdempotentMutationInTx,
  toPublicErrorPayload,
} from "@/lib/mutationReceipt";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

async function fileContentHash(file: File): Promise<string> {
  const buf = Buffer.from(await file.arrayBuffer());
  return createHash("sha256").update(buf).digest("hex");
}

export async function POST(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  let uploadedPhotoPath: string | null = null;
  try {
    let form: FormData;
    try {
      form = await req.formData();
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
    const hasPhoto = photo instanceof File && photo.size > 0;
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
      has_necklace: form.get("has_necklace") === "1",
      has_earrings: form.get("has_earrings") === "1",
      has_teeka: form.get("has_teeka") === "1",
      has_pasa: form.get("has_pasa") === "1",
      photo_content_hash: photoHash,
    };

    // Upload before the authoritative DB transaction (stable content hash already claimed).
    if (hasPhoto) {
      uploadedPhotoPath = await saveFastInventoryPhoto(photo as File);
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

    const { result, reused } = await runIdempotentMutationInTx(
      {
        operationId,
        operationType: "inventory_create",
        actorUserId: user.id,
        payload: canonicalPayload,
      },
      async (tx) => {
        const { items } = await createInventoryItemInTx(tx, formInput, uploadedPhotoPath || "");
        const primary = items[0];
        const pipeline = primary ? computePipelineStatus(primary) : null;
        return {
          ok: true as const,
          count: items.length,
          ids: items.map((i) => i.id),
          id: primary?.id,
          sku: primary?.sku ?? "",
          name: primary?.name ?? "",
          original_photo_url: primary ? photoUrl(primary.photo) : "",
          display_photo_url: pipeline?.display_photo_url || "",
          pipeline,
          _hasPhoto: Boolean(uploadedPhotoPath),
          _itemSnapshots: items.map((i) => ({
            id: i.id,
            name: i.name,
            category: i.category,
            size: i.size,
          })),
        };
      },
    );

    if (!reused) {
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

      let ai_queue_warning: string | undefined;
      if (result._hasPhoto && result.ids.length) {
        try {
          const queued = await enqueueInventoryPhotoJobsDurable(result.ids, "photo_created");
          ai_queue_warning = queued.warning || undefined;
        } catch (e) {
          console.error("[inventory POST] AI enqueue failed:", e);
          ai_queue_warning =
            "Inventory saved but AI queue could not be written. Retry from AI indexing.";
        }
        if (!ai_queue_warning) {
          after(async () => {
            try {
              const { drainAiJobQueue } = await import("@/lib/dressChecker/aiJobWorker");
              await drainAiJobQueue(1, { source: "inventory_save" });
            } catch (err) {
              console.error("[inventory POST] after() AI drain:", err);
            }
          });
        }
      }

      const {
        _hasPhoto: _a,
        _itemSnapshots: _b,
        ...publicResult
      } = result;
      return jsonOk({ ...publicResult, ai_queue_warning });
    }

    const { _hasPhoto: _a, _itemSnapshots: _b, ...publicResult } = result;
    return jsonOk({ ...publicResult, reused: true });
  } catch (e) {
    if (uploadedPhotoPath) {
      await enqueueBlobCleanup([uploadedPhotoPath], {
        reason: "orphan_inventory_create_upload",
      });
    }
    if (e instanceof MutationIdempotencyError) {
      const pub = toPublicErrorPayload(e);
      return jsonError(pub.error, e.httpStatus, { code: pub.code, retryable: pub.retryable });
    }
    const message = e instanceof Error ? e.message : "Failed to add item";
    console.error("[api/inventory POST]", message.slice(0, 200));
    return jsonError(message, 500);
  }
}
