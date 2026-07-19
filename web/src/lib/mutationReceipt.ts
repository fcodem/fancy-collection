import "server-only";

import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { hashRequestPayload } from "@/lib/mutationIdempotency";
import {
  MutationIdempotencyError,
  type MutationErrorCode,
  toPublicErrorPayload,
} from "@/lib/mutationErrors";
import { enqueueBlobCleanup } from "@/lib/blobCleanup";

export {
  MutationIdempotencyError,
  toPublicErrorPayload,
  type MutationErrorCode,
} from "@/lib/mutationErrors";

export type IdempotentMutationOpts = {
  operationId: string;
  operationType: string;
  bookingId?: number | null;
  actorUserId?: number | null;
  payload: unknown;
  leaseMs?: number;
};

const DEFAULT_LEASE_MS = 120_000;

function requireOperationId(operationId: string | undefined | null): string {
  const id = typeof operationId === "string" ? operationId.trim() : "";
  if (!id || id.length < 8) {
    throw new MutationIdempotencyError(
      "INVALID_OPERATION_ID",
      "operation_id is required",
      400,
      false,
    );
  }
  return id;
}

function isSchemaUnavailable(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : "";
  const code = (e as { code?: string })?.code;
  return /does not exist|Unknown arg|mutation_receipts|P2021/i.test(msg) || code === "P2021";
}

type ClaimResult =
  | { kind: "reuse"; result: unknown }
  | {
      kind: "execute";
      operationId: string;
      requestHash: string;
      /** Staging persisted by an earlier attempt of this operation (e.g. uploaded photo paths). */
      staging: Record<string, unknown> | null;
    };

/**
 * Claim (or reclaim expired lease) a mutation receipt.
 *
 * Fast path is ONE atomic `INSERT … ON CONFLICT DO UPDATE … RETURNING`
 * statement (the previous interactive transaction cost 4+ cross-region round
 * trips per save). The conflict-refused path (completed / failed / lease held /
 * payload mismatch) does one follow-up SELECT to classify the refusal.
 *
 * Business work must then run in a transaction that calls
 * `completeMutationReceiptInTx` before commit so a crash cannot leave the
 * mutation committed while the receipt stays processing.
 */
export async function claimMutationReceipt(opts: IdempotentMutationOpts): Promise<ClaimResult> {
  const operationId = requireOperationId(opts.operationId);
  const requestHash = hashRequestPayload(opts.payload);
  const leaseMs = opts.leaseMs ?? DEFAULT_LEASE_MS;
  const now = new Date();
  const leaseExpires = new Date(now.getTime() + leaseMs);

  try {
    // Insert a fresh claim, or atomically reclaim an expired lease for the SAME
    // payload. The WHERE guard means a mismatched payload or an active lease
    // never mutates the row — those cases return zero rows and are classified below.
    const claimed = await prisma.$queryRaw<
      Array<{ status: string; result_json: unknown }>
    >`
      INSERT INTO mutation_receipts (
        operation_id, operation_type, booking_id, actor_user_id,
        request_hash, status, claimed_at, lease_expires_at, created_at
      ) VALUES (
        ${operationId}, ${opts.operationType}, ${opts.bookingId ?? null}, ${opts.actorUserId ?? null},
        ${requestHash}, 'processing', ${now}, ${leaseExpires}, ${now}
      )
      ON CONFLICT (operation_id) DO UPDATE SET
        claimed_at = ${now},
        lease_expires_at = ${leaseExpires},
        error_message = NULL,
        error_code = NULL
      WHERE mutation_receipts.status = 'processing'
        AND mutation_receipts.request_hash = ${requestHash}
        AND (
          mutation_receipts.lease_expires_at IS NULL
          OR mutation_receipts.lease_expires_at <= ${now}
        )
      RETURNING status, result_json
    `;

    if (claimed.length > 0) {
      const staging = claimed[0]?.result_json;
      return {
        kind: "execute" as const,
        operationId,
        requestHash,
        staging:
          staging && typeof staging === "object"
            ? (staging as Record<string, unknown>)
            : null,
      };
    }

    // Conflict refused — classify from the current row state.
    const existing = await prisma.mutationReceipt.findUnique({
      where: { operationId },
      select: { requestHash: true, status: true, resultJson: true, leaseExpiresAt: true },
    });
    if (!existing) {
      // Row vanished between statements (cleanup race) — caller may retry.
      throw new MutationIdempotencyError(
        "OPERATION_IN_PROGRESS",
        "This operation is still processing",
        409,
        true,
      );
    }
    if (existing.requestHash !== requestHash) {
      throw new MutationIdempotencyError(
        "OPERATION_PAYLOAD_MISMATCH",
        "operation_id was already used with a different payload",
        409,
        false,
      );
    }
    if (existing.status === "completed" && existing.resultJson != null) {
      return { kind: "reuse" as const, result: existing.resultJson };
    }
    if (existing.status === "failed") {
      throw new MutationIdempotencyError(
        "OPERATION_PREVIOUSLY_FAILED",
        "This operation_id previously failed. Start a new operation_id.",
        409,
        false,
      );
    }
    throw new MutationIdempotencyError(
      "OPERATION_IN_PROGRESS",
      "This operation is still processing",
      409,
      true,
    );
  } catch (e) {
    if (e instanceof MutationIdempotencyError) throw e;
    if (isSchemaUnavailable(e)) {
      throw new MutationIdempotencyError(
        "OPERATION_SCHEMA_UNAVAILABLE",
        "Mutation receipt storage is unavailable. Retry after migrations are applied.",
        503,
        true,
      );
    }
    throw e;
  }
}

/** Persist staging fields (e.g. uploaded photo path) on a processing receipt for retry reuse. */
export async function storeMutationStaging(
  operationId: string,
  staging: Record<string, unknown>,
): Promise<void> {
  try {
    await prisma.mutationReceipt.update({
      where: { operationId },
      data: {
        resultJson: staging as object,
      },
    });
  } catch {
    /* ignore */
  }
}

export async function readMutationStaging(
  operationId: string,
): Promise<Record<string, unknown> | null> {
  try {
    const row = await prisma.mutationReceipt.findUnique({
      where: { operationId },
      select: { status: true, resultJson: true },
    });
    if (!row || row.status !== "processing" || !row.resultJson || typeof row.resultJson !== "object") {
      return null;
    }
    return row.resultJson as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Must be called on the same transaction client as the business mutation, before commit. */
export async function completeMutationReceiptInTx(
  tx: Prisma.TransactionClient,
  operationId: string,
  result: unknown,
): Promise<void> {
  await tx.mutationReceipt.update({
    where: { operationId },
    data: {
      status: "completed",
      resultJson: result as object,
      completedAt: new Date(),
      leaseExpiresAt: null,
      errorMessage: null,
      errorCode: null,
    },
  });
}

export async function failMutationReceipt(
  operationId: string,
  errorMessage: string,
  errorCode = "FAILED",
): Promise<void> {
  try {
    await prisma.mutationReceipt.update({
      where: { operationId },
      data: {
        status: "failed",
        errorCode,
        errorMessage: errorMessage.slice(0, 500),
        completedAt: new Date(),
        leaseExpiresAt: null,
      },
    });
  } catch {
    /* ignore */
  }
}

function collectStagingPaths(resultJson: unknown): string[] {
  if (!resultJson || typeof resultJson !== "object") return [];
  const obj = resultJson as Record<string, unknown>;
  const paths: string[] = [];
  if (typeof obj.staging_photo === "string" && obj.staging_photo) {
    paths.push(obj.staging_photo);
  }
  if (typeof obj.staging_thumbnail === "string" && obj.staging_thumbnail) {
    paths.push(obj.staging_thumbnail);
  }
  if (Array.isArray(obj.staging_photos)) {
    for (const p of obj.staging_photos) {
      if (typeof p === "string" && p) paths.push(p);
    }
  } else if (obj.staging_photos && typeof obj.staging_photos === "object") {
    for (const p of Object.values(obj.staging_photos as Record<string, unknown>)) {
      if (typeof p === "string" && p) paths.push(p);
    }
  }
  if (Array.isArray(obj.staging_paths)) {
    for (const p of obj.staging_paths) {
      if (typeof p === "string" && p) paths.push(p);
    }
  }
  return [...new Set(paths)];
}

/**
 * Reclaim Blob paths left on abandoned processing receipts (expired lease, >48h old)
 * and mark those receipts failed so they cannot be retried forever.
 */
export async function cleanupAbandonedMutationStaging(
  limit = 25,
): Promise<{ cleaned: number; paths: number }> {
  const now = new Date();
  const olderThan = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  let cleaned = 0;
  let pathCount = 0;

  try {
    const rows = await prisma.mutationReceipt.findMany({
      where: {
        status: "processing",
        leaseExpiresAt: { lt: now },
        createdAt: { lt: olderThan },
      },
      select: { operationId: true, resultJson: true },
      take: Math.max(1, Math.min(limit, 100)),
      orderBy: { createdAt: "asc" },
    });

    for (const row of rows) {
      const paths = collectStagingPaths(row.resultJson);
      if (!paths.length) continue;
      await enqueueBlobCleanup(paths, { reason: "abandoned_mutation_staging" });
      pathCount += paths.length;
      await failMutationReceipt(
        row.operationId,
        "Abandoned staging cleaned after lease expiry",
        "ABANDONED_STAGING",
      );
      cleaned += 1;
    }
  } catch (e) {
    if (isSchemaUnavailable(e)) return { cleaned: 0, paths: 0 };
    throw e;
  }

  return { cleaned, paths: pathCount };
}

/**
 * Crash-safe when `mutate` uses `completeReceipt` inside the same DB transaction as business work.
 *
 * Preferred:
 * ```
 * await runIdempotentMutation(opts, async ({ completeReceipt }) => {
 *   return prisma.$transaction(async (tx) => {
 *     const booking = await doWork(tx);
 *     const payload = { ok: true, id: booking.id };
 *     await completeReceipt(tx, payload);
 *     return payload;
 *   });
 * });
 * ```
 */
export async function runIdempotentMutation<T>(
  opts: IdempotentMutationOpts,
  mutate: (helpers: {
    completeReceipt: (tx: Prisma.TransactionClient, result: T) => Promise<void>;
    operationId: string;
  }) => Promise<T>,
): Promise<{ result: T; reused: boolean }> {
  const claim = await claimMutationReceipt(opts);
  if (claim.kind === "reuse") {
    return { result: claim.result as T, reused: true };
  }

  try {
    const result = await mutate({
      operationId: claim.operationId,
      completeReceipt: (tx, payload) =>
        completeMutationReceiptInTx(tx, claim.operationId, payload),
    });
    return { result, reused: false };
  } catch (e) {
    if (!(e instanceof MutationIdempotencyError)) {
      await failMutationReceipt(
        claim.operationId,
        e instanceof Error ? e.message : "mutation failed",
      );
    }
    throw e;
  }
}

/**
 * Runs claim + mutate + receipt completion in one interactive transaction.
 * Use when business work can accept a TransactionClient directly.
 */
export async function runIdempotentMutationInTx<T>(
  opts: IdempotentMutationOpts,
  mutate: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<{ result: T; reused: boolean }> {
  const operationId = requireOperationId(opts.operationId);
  const requestHash = hashRequestPayload(opts.payload);
  const leaseMs = opts.leaseMs ?? DEFAULT_LEASE_MS;
  const now = new Date();
  const leaseExpires = new Date(now.getTime() + leaseMs);

  try {
    return await prisma.$transaction(
      async (tx) => {
        // One atomic claim statement (insert new, or reclaim expired lease for
        // the same payload). Refusals return zero rows and are classified below.
        const claimed = await tx.$queryRaw<Array<{ status: string }>>`
          INSERT INTO mutation_receipts (
            operation_id, operation_type, booking_id, actor_user_id,
            request_hash, status, claimed_at, lease_expires_at, created_at
          ) VALUES (
            ${operationId}, ${opts.operationType}, ${opts.bookingId ?? null}, ${opts.actorUserId ?? null},
            ${requestHash}, 'processing', ${now}, ${leaseExpires}, ${now}
          )
          ON CONFLICT (operation_id) DO UPDATE SET
            claimed_at = ${now},
            lease_expires_at = ${leaseExpires}
          WHERE mutation_receipts.status = 'processing'
            AND mutation_receipts.request_hash = ${requestHash}
            AND (
              mutation_receipts.lease_expires_at IS NULL
              OR mutation_receipts.lease_expires_at <= ${now}
            )
          RETURNING status
        `;

        if (claimed.length === 0) {
          const existing = await tx.mutationReceipt.findUnique({
            where: { operationId },
            select: { requestHash: true, status: true, resultJson: true },
          });
          if (existing && existing.requestHash !== requestHash) {
            throw new MutationIdempotencyError(
              "OPERATION_PAYLOAD_MISMATCH",
              "operation_id was already used with a different payload",
              409,
              false,
            );
          }
          if (existing?.status === "completed" && existing.resultJson != null) {
            return { result: existing.resultJson as T, reused: true };
          }
          if (existing?.status === "failed") {
            throw new MutationIdempotencyError(
              "OPERATION_PREVIOUSLY_FAILED",
              "This operation_id previously failed. Start a new operation_id.",
              409,
              false,
            );
          }
          throw new MutationIdempotencyError(
            "OPERATION_IN_PROGRESS",
            "This operation is still processing",
            409,
            true,
          );
        }

        const result = await mutate(tx);
        await completeMutationReceiptInTx(tx, operationId, result);
        return { result, reused: false };
      },
      { maxWait: 10_000, timeout: 55_000 },
    );
  } catch (e) {
    if (e instanceof MutationIdempotencyError) throw e;
    if (isSchemaUnavailable(e)) {
      throw new MutationIdempotencyError(
        "OPERATION_SCHEMA_UNAVAILABLE",
        "Mutation receipt storage is unavailable. Retry after migrations are applied.",
        503,
        true,
      );
    }
    await failMutationReceipt(
      operationId,
      e instanceof Error ? e.message : "mutation failed",
    );
    throw e;
  }
}

export { hashRequestPayload };
