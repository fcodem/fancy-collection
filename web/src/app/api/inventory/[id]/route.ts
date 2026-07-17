import { NextRequest } from "next/server";
import { createHash } from "crypto";
import prisma from "@/lib/prisma";
import { updateInventoryItem, deleteInventoryItem } from "@/lib/services/inventoryOps";
import { dressDisplayName } from "@/lib/dress";
import { catalogPhotoUrl, recognitionPhotoUrl } from "@/lib/catalogPhotoUrl";
import { photoUrl } from "@/lib/photoUrl";
import { computePipelineStatus } from "@/lib/inventoryPhotoPipeline";
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
  failMutationReceipt,
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
  try {
    const form = await req.formData();
    const operationIdOrErr = requireOperationId(form.get("operation_id"));
    if (isResponse(operationIdOrErr)) return operationIdOrErr;
    const operationId = operationIdOrErr;

    const photo = form.get("photo");
    const hasPhoto = photo instanceof File && photo.size > 0;
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
      status: String(form.get("status") || ""),
      sub_category: String(form.get("sub_category") || "Normal"),
      remove_photo: form.get("remove_photo") === "1",
      has_necklace: form.get("has_necklace") === "1",
      has_earrings: form.get("has_earrings") === "1",
      has_teeka: form.get("has_teeka") === "1",
      has_pasa: form.get("has_pasa") === "1",
      photo_content_hash: photoHash,
    };

    const claim = await claimMutationReceipt({
      operationId,
      operationType: "inventory_update",
      actorUserId: user.id,
      payload: canonicalPayload,
    });
    if (claim.kind === "reuse") {
      return jsonOk({ ...(claim.result as object), reused: true });
    }

    try {
      const item = await updateInventoryItem(
        itemId,
        {
          name: String(form.get("name") || ""),
          category: String(form.get("category") || ""),
          size: String(form.get("size") || ""),
          color: String(form.get("color") || ""),
          daily_rate: Number(form.get("daily_rate") || 0),
          deposit: Number(form.get("deposit") || 0),
          condition_notes: String(form.get("condition_notes") || ""),
          status: String(form.get("status") || ""),
          sub_category: String(form.get("sub_category") || "Normal"),
          photo: hasPhoto ? (photo as File) : null,
          remove_photo: form.get("remove_photo") === "1",
          has_necklace: form.get("has_necklace") === "1",
          has_earrings: form.get("has_earrings") === "1",
          has_teeka: form.get("has_teeka") === "1",
          has_pasa: form.get("has_pasa") === "1",
        },
        user.username,
      );
      const pipeline = computePipelineStatus(item);
      const payload = {
        ok: true as const,
        id: item.id,
        original_photo_url: photoUrl(item.photo),
        display_photo_url: pipeline.display_photo_url,
        pipeline,
      };
      await prisma.$transaction(async (tx) => {
        await completeMutationReceiptInTx(tx, operationId, payload);
      });
      return jsonOk(payload);
    } catch (e) {
      await failMutationReceipt(
        operationId,
        e instanceof Error ? e.message : "update failed",
      );
      throw e;
    }
  } catch (e) {
    if (e instanceof MutationIdempotencyError) {
      const pub = toPublicErrorPayload(e);
      return jsonError(pub.error, e.httpStatus, { code: pub.code, retryable: pub.retryable });
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
