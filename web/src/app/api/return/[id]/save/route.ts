import { NextRequest, after } from "next/server";
import { createHash } from "crypto";
import prisma from "@/lib/prisma";
import { saveReturn } from "@/lib/services/operations";
import { savePrivateBookingUpload } from "@/lib/upload";
import {
  jsonError,
  jsonOk,
  requireUser,
  isResponse,
  requireJsonContentType,
  requireOperationId,
} from "@/lib/api";
import {
  processWhatsAppJobQueue,
  scheduleReturnSlipInTx,
  scheduleIncompleteSlipInTx,
} from "@/lib/services/whatsapp/jobQueue";
import { isWhatsAppReceiptsDisabled } from "@/lib/services/whatsapp/metaApi";
import {
  resolvePartialReturnScope,
  resolveIncompleteScope,
} from "@/lib/slipDelta";
import { createPerfTimer, withServerTiming } from "@/lib/perfTiming";
import {
  MutationIdempotencyError,
  claimMutationReceipt,
  completeMutationReceiptInTx,
  readMutationStaging,
  runIdempotentMutationInTx,
  storeMutationStaging,
  toPublicErrorPayload,
} from "@/lib/mutationReceipt";
import { enqueueBlobCleanup } from "@/lib/blobCleanup";
import { scheduleBookingPrivateMediaCleanup } from "@/lib/bookingPrivateMediaCleanup";
import { trackBookingPrivateMedia } from "@/lib/bookingPrivateMediaTracking";
import { BOOKING_PRIVATE_MEDIA_TYPES } from "@/lib/bookingPrivateMediaTypes";
import { broadcastShopEvent } from "@/lib/realtime/broadcast";

export const maxDuration = 60;

/** Upload concurrency limiter (server-safe; mirrors client mapPool). */
async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!, i);
    }
  }
  const n = Math.max(1, Math.min(concurrency, items.length || 1));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

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

function idempotencyErrorResponse(e: MutationIdempotencyError) {
  const pub = toPublicErrorPayload(e);
  return jsonError(pub.error, e.httpStatus, { code: pub.code, retryable: pub.retryable });
}

async function scheduleReturnSlipsInTx(
  tx: Parameters<typeof scheduleReturnSlipInTx>[0],
  booking: {
    bookingItems?: Array<{
      id: number;
      isDelivered?: boolean;
      isReturned?: boolean;
      isIncompleteReturn?: boolean;
      isCancelled?: boolean;
      returnSlipNotifiedAt?: Date | null;
    }>;
  },
  opts: {
    bookingId: number;
    requestOrigin: string;
    createdBy: string;
    returnItemIds: number[];
    incompleteItemIds: number[];
  },
): Promise<{ slipQueued: boolean; slipDisabled: boolean; slipJobIds: number[] }> {
  if (isWhatsAppReceiptsDisabled()) {
    return { slipQueued: false, slipDisabled: true, slipJobIds: [] };
  }

  const slipJobIds: number[] = [];
  let slipQueued = false;

  const partial = resolvePartialReturnScope(
    booking,
    opts.returnItemIds.length ? opts.returnItemIds : undefined,
  );
  if (partial) {
    const job = await scheduleReturnSlipInTx(
      tx,
      opts.bookingId,
      {
        scope: partial.scope,
        bookingItemId: partial.bookingItemId,
        bookingItemIds: partial.bookingItemIds,
      },
      opts.requestOrigin,
      opts.createdBy,
    );
    if (job?.id) {
      slipQueued = true;
      slipJobIds.push(job.id);
    }
  }

  const incomplete = resolveIncompleteScope(
    booking,
    opts.incompleteItemIds.length ? opts.incompleteItemIds : undefined,
  );
  if (incomplete) {
    const job = await scheduleIncompleteSlipInTx(
      tx,
      opts.bookingId,
      {
        scope: incomplete.scope,
        bookingItemId: incomplete.bookingItemId,
        bookingItemIds: incomplete.bookingItemIds,
      },
      opts.requestOrigin,
      opts.createdBy,
    );
    if (job?.id) {
      slipQueued = true;
      slipJobIds.push(job.id);
    }
  }

  return { slipQueued, slipDisabled: false, slipJobIds };
}

function drainQueueAfter(bookingId: number) {
  after(async () => {
    try {
      await processWhatsAppJobQueue(2, { bookingId });
    } catch (e) {
      console.error("[return save] whatsapp queue error:", e);
    }
  });
}

async function trackUploadedReturnPhotos(
  bookingId: number,
  incompletePhoto?: string,
  items?: IncompleteItemPayload[],
) {
  if (incompletePhoto) {
    await trackBookingPrivateMedia({
      bookingId,
      blobUrl: incompletePhoto,
      mediaType: BOOKING_PRIVATE_MEDIA_TYPES.INCOMPLETE_RETURN,
    });
  }
  for (const item of items ?? []) {
    if (item.is_incomplete && item.incomplete_photo) {
      await trackBookingPrivateMedia({
        bookingId,
        blobUrl: item.incomplete_photo,
        bookingItemId: item.booking_item_id,
        mediaType: BOOKING_PRIVATE_MEDIA_TYPES.INCOMPLETE_RETURN,
      });
    }
  }
}

async function runPostCommitReturnSideEffects(
  bookingId: number,
  deferredPaths: string[],
  status?: string | null,
) {
  if (deferredPaths.length) {
    await enqueueBlobCleanup(deferredPaths, {
      reason: "return_post_commit_cleanup",
      bookingId,
    });
  }
  if (status === "returned") {
    await scheduleBookingPrivateMediaCleanup(bookingId);
  }
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

      const staging = await readMutationStaging(operationId);
      const stagedMain =
        typeof staging?.staging_photo === "string" ? staging.staging_photo : null;
      const stagedByItem =
        staging?.staging_photos && typeof staging.staging_photos === "object"
          ? (staging.staging_photos as Record<string, string>)
          : {};

      const uploadedPaths: string[] = [];
      try {
        perf.mark("photo");
        let incomplete_photo: string | undefined = stagedMain || undefined;
        if (incomplete_photo) uploadedPaths.push(incomplete_photo);

        type UploadJob =
          | { kind: "main"; file: File }
          | { kind: "item"; bookingItemId: number; file: File };
        const jobs: UploadJob[] = [];
        if (photoFile && !incomplete_photo) {
          jobs.push({ kind: "main", file: photoFile });
        }
        for (const item of items) {
          if (!item.is_incomplete) continue;
          const key = String(item.booking_item_id);
          const staged = stagedByItem[key];
          if (staged) {
            item.incomplete_photo = staged;
            uploadedPaths.push(staged);
            continue;
          }
          const f = itemPhotoFiles.get(item.booking_item_id);
          if (f) jobs.push({ kind: "item", bookingItemId: item.booking_item_id, file: f });
        }

        if (jobs.length) {
          const uploaded = await mapPool(jobs, 2, async (job) => {
            const path = await savePrivateBookingUpload(job.file, "incomplete-returns");
            return { job, path };
          });
          const nextItemPhotos: Record<string, string> = { ...stagedByItem };
          for (const { job, path } of uploaded) {
            uploadedPaths.push(path);
            if (job.kind === "main") {
              incomplete_photo = path;
            } else {
              const target = items.find((i) => i.booking_item_id === job.bookingItemId);
              if (target) target.incomplete_photo = path;
              nextItemPhotos[String(job.bookingItemId)] = path;
            }
          }
          await storeMutationStaging(operationId, {
            staging_photo: incomplete_photo ?? stagedMain ?? null,
            staging_photos: nextItemPhotos,
            photo_content_hash: photoHash,
          });
        } else if (incomplete_photo || Object.keys(stagedByItem).length) {
          // Ensure staging is present for reclaim after lease expiry.
          await storeMutationStaging(operationId, {
            staging_photo: incomplete_photo ?? null,
            staging_photos: stagedByItem,
            photo_content_hash: photoHash,
          });
        }
        perf.endStage("photoUploadMs", "photo");

        await trackUploadedReturnPhotos(bookingId, incomplete_photo, items);

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
          const deferredPaths = [
            ...(((booking as { pathsToCleanup?: string[] }).pathsToCleanup) ?? []),
            ...(((booking as { photosToClear?: Array<string | null> }).photosToClear) ?? []),
            ...(((booking as { blobPathsToCleanup?: string[] }).blobPathsToCleanup) ?? []),
          ].filter((p): p is string => Boolean(p));

          const slips = await scheduleReturnSlipsInTx(tx, booking ?? { bookingItems: [] }, {
            bookingId,
            requestOrigin: req.nextUrl.origin,
            createdBy: user.username,
            returnItemIds,
            incompleteItemIds,
          });

          const payload = {
            ok: true,
            id: booking?.id,
            status: booking?.status,
            newly_returned_item_ids: returnItemIds,
            newly_incomplete_item_ids: incompleteItemIds,
            slip_queued: slips.slipQueued,
            slip_job_ids: slips.slipJobIds,
            ...(slips.slipDisabled ? { slip_disabled: true } : {}),
            _deferredPaths: deferredPaths,
            _status: booking?.status,
          };
          await completeMutationReceiptInTx(tx, operationId, {
            ok: true,
            id: payload.id,
            status: payload.status,
            newly_returned_item_ids: payload.newly_returned_item_ids,
            newly_incomplete_item_ids: payload.newly_incomplete_item_ids,
            slip_queued: payload.slip_queued,
            slip_job_ids: payload.slip_job_ids,
            ...(slips.slipDisabled ? { slip_disabled: true } : {}),
          });
          return payload;
        });

        if (result._deferredPaths.length || result._status === "returned") {
          await runPostCommitReturnSideEffects(
            bookingId,
            result._deferredPaths,
            result._status,
          );
        }
        broadcastShopEvent({
          type: "booking.returned",
          bookingId,
          status: result._status,
          by: user.username,
        });
        if (result.slip_queued) {
          drainQueueAfter(bookingId);
        }

        const { _deferredPaths: _a, _status: _b, ...publicResult } = result;
        const timings = perf.finish({
          kind: uploadedPaths.length ? "photo" : "mutation",
        });
        return withServerTiming(jsonOk(publicResult), timings);
      } catch (e) {
        // Keep receipt reclaimable with staging photos intact — do not mark failed
        // and do not delete staged uploads (retry reuses them).
        try {
          await prisma.mutationReceipt.update({
            where: { operationId },
            data: {
              leaseExpiresAt: new Date(0),
              errorMessage: (e instanceof Error ? e.message : "mutation failed").slice(0, 500),
            },
          });
        } catch {
          /* ignore */
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

    let deferredPaths: string[] = [];
    let committedStatus: string | null | undefined;
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
        const incompleteItemIds = Array.isArray(body.items)
          ? (body.items as IncompleteItemPayload[])
              .filter((i) => i.is_incomplete)
              .map((i) => Number(i.booking_item_id))
              .filter((n) => n > 0)
          : [];
        deferredPaths = [
          ...(((booking as { pathsToCleanup?: string[] }).pathsToCleanup) ?? []),
          ...(((booking as { photosToClear?: Array<string | null> }).photosToClear) ?? []),
          ...(((booking as { blobPathsToCleanup?: string[] }).blobPathsToCleanup) ?? []),
        ].filter((p): p is string => Boolean(p));
        committedStatus = booking?.status;

        const slips = await scheduleReturnSlipsInTx(tx, booking ?? { bookingItems: [] }, {
          bookingId,
          requestOrigin: req.nextUrl.origin,
          createdBy: user.username,
          returnItemIds,
          incompleteItemIds,
        });

        return {
          ok: true,
          id: booking?.id,
          status: booking?.status,
          newly_returned_item_ids: returnItemIds,
          slip_queued: slips.slipQueued,
          slip_job_ids: slips.slipJobIds,
          ...(slips.slipDisabled ? { slip_disabled: true } : {}),
        };
      },
    );

    if (!reused) {
      if (deferredPaths.length || committedStatus === "returned") {
        await runPostCommitReturnSideEffects(bookingId, deferredPaths, committedStatus);
      }
      broadcastShopEvent({
        type: "booking.returned",
        bookingId,
        status: result.status,
        by: user.username,
      });
      if (result.slip_queued) {
        drainQueueAfter(bookingId);
      }
    }

    const timings = perf.finish({ kind: "mutation" });
    return withServerTiming(jsonOk({ ...result, reused: reused || undefined }), timings);
  } catch (e) {
    perf.finish({ kind: "mutation", forceLog: true });
    if (e instanceof MutationIdempotencyError) return idempotencyErrorResponse(e);
    return jsonError(e instanceof Error ? e.message : "Save failed");
  }
}
