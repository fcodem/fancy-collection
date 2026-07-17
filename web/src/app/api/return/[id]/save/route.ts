import { NextRequest, after } from "next/server";
import { createHash } from "crypto";
import prisma from "@/lib/prisma";
import { saveReturn } from "@/lib/services/operations";
import { saveUpload } from "@/lib/upload";
import {
  jsonError,
  jsonOk,
  requireUser,
  isResponse,
  requireJsonContentType,
  requireOperationId,
} from "@/lib/api";
import { finalizeSlipTrigger } from "@/lib/services/whatsapp/slipDebounce";
import { processWhatsAppJobQueue } from "@/lib/services/whatsapp/jobQueue";
import { createPerfTimer, withServerTiming } from "@/lib/perfTiming";
import {
  MutationIdempotencyError,
  claimMutationReceipt,
  completeMutationReceiptInTx,
  failMutationReceipt,
  runIdempotentMutationInTx,
  toPublicErrorPayload,
} from "@/lib/mutationReceipt";
import { enqueueBlobCleanup } from "@/lib/blobCleanup";

export const maxDuration = 60;

type IncompleteItemPayload = {
  booking_item_id: number;
  is_incomplete: boolean;
  incomplete_notes?: string;
  security_held?: number;
  incomplete_photo?: string;
  /** Stable content hash — used for idempotency, not Blob URLs. */
  photo_content_hash?: string;
};

async function fileContentHash(file: File): Promise<string> {
  const buf = Buffer.from(await file.arrayBuffer());
  return createHash("sha256").update(buf).digest("hex");
}

const IMMEDIATE_RETURN_SLIP_ACTIONS = new Set([
  "mark_returned",
  "incomplete_return",
  "resolve_incomplete_return",
]);

async function triggerReturnSlip(
  bookingId: number,
  action: string,
  opts: {
    requestOrigin: string;
    createdBy: string;
    returnItemIds?: number[];
    incompleteItemIds?: number[];
  },
) {
  try {
    await finalizeSlipTrigger(bookingId, "return", {
      requestOrigin: opts.requestOrigin,
      createdBy: opts.createdBy,
      ...(opts.returnItemIds?.length ? { returnItemIds: opts.returnItemIds } : {}),
      ...(opts.incompleteItemIds?.length
        ? { incompleteItemIds: opts.incompleteItemIds }
        : {}),
    });
    after(async () => {
      try {
        await processWhatsAppJobQueue(2, { bookingId });
      } catch (e) {
        console.error("[return save] whatsapp queue error:", e);
      }
    });
    return true;
  } catch (e) {
    console.error("[return save] WhatsApp slip error:", e);
    return false;
  }
}

function idempotencyErrorResponse(e: MutationIdempotencyError) {
  const pub = toPublicErrorPayload(e);
  return jsonError(pub.error, e.httpStatus, { code: pub.code, retryable: pub.retryable });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const perf = createPerfTimer("POST /api/return/[id]/save");
  perf.mark("auth");
  const user = await requireUser();
  perf.endStage("authMs", "auth");
  if (isResponse(user)) return user;
  const { id } = await params;
  const bookingId = parseInt(id, 10);

  try {
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      perf.mark("parse");
      const form = await req.formData();
      perf.endStage("parseMs", "parse");
      const action = String(form.get("action") || "");
      const operationIdOrErr = requireOperationId(form.get("operation_id"));
      if (isResponse(operationIdOrErr)) return operationIdOrErr;
      const operationId = operationIdOrErr;

      const incomplete_notes = String(form.get("incomplete_notes") || "");
      const security_held = Number(form.get("security_held") || 0);

      const photo = form.get("incomplete_photo");
      let photoHash: string | null = null;
      let photoFile: File | null = null;
      if (photo instanceof File && photo.size > 0) {
        photoFile = photo;
        photoHash = await fileContentHash(photo);
      }

      let items: IncompleteItemPayload[] = [];
      const itemsRaw = form.get("items");
      if (itemsRaw) {
        try {
          items = JSON.parse(String(itemsRaw)) as IncompleteItemPayload[];
        } catch {
          return jsonError("Invalid items payload");
        }
      }

      const itemPhotoFiles = new Map<number, File>();
      for (const item of items) {
        if (!item.is_incomplete) continue;
        const itemPhoto = form.get(`item_photo_${item.booking_item_id}`);
        if (itemPhoto instanceof File && itemPhoto.size > 0) {
          itemPhotoFiles.set(item.booking_item_id, itemPhoto);
          item.photo_content_hash = await fileContentHash(itemPhoto);
        }
      }

      // Hash uses content hashes — never freshly minted Blob URLs
      const canonicalPayload = {
        bookingId,
        action,
        incomplete_notes,
        security_held,
        photo_content_hash: photoHash,
        items: items.map((it) => ({
          booking_item_id: it.booking_item_id,
          is_incomplete: it.is_incomplete,
          incomplete_notes: it.incomplete_notes,
          security_held: it.security_held,
          photo_content_hash: it.photo_content_hash ?? null,
        })),
      };

      const claim = await claimMutationReceipt({
        operationId,
        operationType: `return_${action || "multipart"}`,
        bookingId,
        actorUserId: user.id,
        payload: canonicalPayload,
      });
      if (claim.kind === "reuse") {
        const timings = perf.finish({ kind: "mutation" });
        return withServerTiming(
          jsonOk({ ...(claim.result as object), reused: true }),
          timings,
        );
      }

      const uploadedPaths: string[] = [];
      try {
        perf.mark("photo");
        let incomplete_photo: string | undefined;
        if (photoFile) {
          incomplete_photo = await saveUpload(photoFile);
          uploadedPaths.push(incomplete_photo);
        }
        for (const item of items) {
          const f = itemPhotoFiles.get(item.booking_item_id);
          if (f) {
            item.incomplete_photo = await saveUpload(f);
            uploadedPaths.push(item.incomplete_photo);
          }
        }
        perf.endStage("photoUploadMs", "photo");

        const result = await prisma.$transaction(async (tx) => {
          perf.mark("tx");
          const booking = await saveReturn(
            bookingId,
            action,
            {
              incomplete_notes,
              security_held,
              incomplete_photo,
              items: items.length ? items : undefined,
            },
            user.username,
            { tx },
          );
          perf.endStage("transactionMs", "tx");

          const returnItemIds =
            (booking as { newlyReturnedItemIds?: number[] }).newlyReturnedItemIds ?? [];
          const incompleteItemIds = items
            .filter((i) => i.is_incomplete)
            .map((i) => i.booking_item_id);

          const payload = {
            ok: true,
            id: booking?.id,
            status: booking?.status,
            newly_returned_item_ids: returnItemIds,
            newly_incomplete_item_ids: incompleteItemIds,
            slip_queued:
              returnItemIds.length > 0 ||
              incompleteItemIds.length > 0 ||
              IMMEDIATE_RETURN_SLIP_ACTIONS.has(action),
          };
          await completeMutationReceiptInTx(tx, operationId, payload);
          return payload;
        });

        if (result.slip_queued) {
          await triggerReturnSlip(bookingId, action, {
            requestOrigin: req.nextUrl.origin,
            createdBy: user.username,
            returnItemIds: result.newly_returned_item_ids,
            incompleteItemIds: result.newly_incomplete_item_ids,
          });
        }

        const timings = perf.finish({
          kind: uploadedPaths.length ? "photo" : "mutation",
        });
        return withServerTiming(jsonOk(result), timings);
      } catch (e) {
        await failMutationReceipt(
          operationId,
          e instanceof Error ? e.message : "mutation failed",
        );
        if (uploadedPaths.length) {
          await enqueueBlobCleanup(uploadedPaths, {
            reason: "orphan_incomplete_return_upload",
            bookingId,
          });
        }
        throw e;
      }
    }

    const _ct = requireJsonContentType(req);
    if (_ct) return _ct;
    perf.mark("parse");
    const body = await req.json();
    perf.endStage("parseMs", "parse");
    const action = String(body.action || "");
    const operationIdOrErr = requireOperationId(body.operation_id);
    if (isResponse(operationIdOrErr)) return operationIdOrErr;
    const operationId = operationIdOrErr;

    const canonicalPayload = {
      bookingId,
      action,
      booking_item_id: body.booking_item_id ? Number(body.booking_item_id) : undefined,
      booking_item_ids: Array.isArray(body.booking_item_ids)
        ? body.booking_item_ids.map(Number).filter((n: number) => n > 0)
        : undefined,
      incomplete_notes: body.incomplete_notes,
      security_held: Number(body.security_held || 0),
      items: Array.isArray(body.items) ? body.items : undefined,
    };

    const { result, reused } = await runIdempotentMutationInTx(
      {
        operationId,
        operationType: `return_${action || "json"}`,
        bookingId,
        actorUserId: user.id,
        payload: canonicalPayload,
      },
      async (tx) => {
        perf.mark("tx");
        const booking = await saveReturn(
          bookingId,
          action,
          {
            booking_item_id: body.booking_item_id ? Number(body.booking_item_id) : undefined,
            booking_item_ids: Array.isArray(body.booking_item_ids)
              ? body.booking_item_ids.map(Number).filter((n: number) => n > 0)
              : undefined,
            incomplete_notes: body.incomplete_notes,
            security_held: Number(body.security_held || 0),
            items: Array.isArray(body.items) ? body.items : undefined,
          },
          user.username,
          { tx },
        );
        perf.endStage("transactionMs", "tx");

        const returnItemIds =
          (booking as { newlyReturnedItemIds?: number[] }).newlyReturnedItemIds ?? [];

        return {
          ok: true,
          id: booking?.id,
          status: booking?.status,
          newly_returned_item_ids: returnItemIds,
          slip_queued:
            returnItemIds.length > 0 || IMMEDIATE_RETURN_SLIP_ACTIONS.has(action),
        };
      },
    );

    if (!reused && result.slip_queued) {
      await triggerReturnSlip(bookingId, action, {
        requestOrigin: req.nextUrl.origin,
        createdBy: user.username,
        returnItemIds: result.newly_returned_item_ids as number[],
      });
    }

    const timings = perf.finish({ kind: "mutation" });
    return withServerTiming(jsonOk({ ...result, reused: reused || undefined }), timings);
  } catch (e) {
    perf.finish({ kind: "mutation", forceLog: true });
    if (e instanceof MutationIdempotencyError) return idempotencyErrorResponse(e);
    return jsonError(e instanceof Error ? e.message : "Save failed");
  }
}
