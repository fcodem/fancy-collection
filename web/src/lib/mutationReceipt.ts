import "server-only";

import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { hashRequestPayload } from "@/lib/mutationIdempotency";
import {
  MutationIdempotencyError,
  type MutationErrorCode,
  toPublicErrorPayload,
} from "@/lib/mutationErrors";

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
  | { kind: "execute"; operationId: string; requestHash: string };

/**
 * Claim (or reclaim expired lease) a mutation receipt.
 * Business work must then run in a transaction that calls `completeMutationReceiptInTx`
 * before commit so a crash cannot leave the mutation committed while the receipt stays processing.
 */
export async function claimMutationReceipt(opts: IdempotentMutationOpts): Promise<ClaimResult> {
  const operationId = requireOperationId(opts.operationId);
  const requestHash = hashRequestPayload(opts.payload);
  const leaseMs = opts.leaseMs ?? DEFAULT_LEASE_MS;
  const now = new Date();
  const leaseExpires = new Date(now.getTime() + leaseMs);

  try {
    return await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{
          operation_id: string;
          request_hash: string;
          status: string;
          result_json: unknown;
          lease_expires_at: Date | null;
        }>
      >`
        SELECT operation_id, request_hash, status, result_json, lease_expires_at
        FROM mutation_receipts
        WHERE operation_id = ${operationId}
        FOR UPDATE
      `;

      const existing = rows[0];
      if (existing) {
        if (existing.request_hash !== requestHash) {
          throw new MutationIdempotencyError(
            "OPERATION_PAYLOAD_MISMATCH",
            "operation_id was already used with a different payload",
            409,
            false,
          );
        }
        if (existing.status === "completed" && existing.result_json != null) {
          return { kind: "reuse" as const, result: existing.result_json };
        }
        if (existing.status === "failed") {
          throw new MutationIdempotencyError(
            "OPERATION_PREVIOUSLY_FAILED",
            "This operation_id previously failed. Start a new operation_id.",
            409,
            false,
          );
        }
        if (existing.status === "processing") {
          const leaseOk =
            existing.lease_expires_at != null && new Date(existing.lease_expires_at) > now;
          if (leaseOk) {
            throw new MutationIdempotencyError(
              "OPERATION_IN_PROGRESS",
              "This operation is still processing",
              409,
              true,
            );
          }
          await tx.mutationReceipt.update({
            where: { operationId },
            data: {
              claimedAt: now,
              leaseExpiresAt: leaseExpires,
              errorMessage: null,
              errorCode: null,
            },
          });
          return { kind: "execute" as const, operationId, requestHash };
        }
      }

      try {
        await tx.mutationReceipt.create({
          data: {
            operationId,
            operationType: opts.operationType,
            bookingId: opts.bookingId ?? null,
            actorUserId: opts.actorUserId ?? null,
            requestHash,
            status: "processing",
            claimedAt: now,
            leaseExpiresAt: leaseExpires,
          },
        });
      } catch (e) {
        if ((e as { code?: string })?.code === "P2002") {
          throw new MutationIdempotencyError(
            "OPERATION_IN_PROGRESS",
            "This operation is still processing",
            409,
            true,
          );
        }
        throw e;
      }
      return { kind: "execute" as const, operationId, requestHash };
    });
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
        const rows = await tx.$queryRaw<
          Array<{
            operation_id: string;
            request_hash: string;
            status: string;
            result_json: unknown;
            lease_expires_at: Date | null;
          }>
        >`
          SELECT operation_id, request_hash, status, result_json, lease_expires_at
          FROM mutation_receipts
          WHERE operation_id = ${operationId}
          FOR UPDATE
        `;

        const existing = rows[0];
        if (existing) {
          if (existing.request_hash !== requestHash) {
            throw new MutationIdempotencyError(
              "OPERATION_PAYLOAD_MISMATCH",
              "operation_id was already used with a different payload",
              409,
              false,
            );
          }
          if (existing.status === "completed" && existing.result_json != null) {
            return { result: existing.result_json as T, reused: true };
          }
          if (existing.status === "failed") {
            throw new MutationIdempotencyError(
              "OPERATION_PREVIOUSLY_FAILED",
              "This operation_id previously failed. Start a new operation_id.",
              409,
              false,
            );
          }
          if (existing.status === "processing") {
            const leaseOk =
              existing.lease_expires_at != null && new Date(existing.lease_expires_at) > now;
            if (leaseOk) {
              throw new MutationIdempotencyError(
                "OPERATION_IN_PROGRESS",
                "This operation is still processing",
                409,
                true,
              );
            }
            await tx.mutationReceipt.update({
              where: { operationId },
              data: { claimedAt: now, leaseExpiresAt: leaseExpires },
            });
          }
        } else {
          try {
            await tx.mutationReceipt.create({
              data: {
                operationId,
                operationType: opts.operationType,
                bookingId: opts.bookingId ?? null,
                actorUserId: opts.actorUserId ?? null,
                requestHash,
                status: "processing",
                claimedAt: now,
                leaseExpiresAt: leaseExpires,
              },
            });
          } catch (e) {
            if ((e as { code?: string })?.code === "P2002") {
              throw new MutationIdempotencyError(
                "OPERATION_IN_PROGRESS",
                "This operation is still processing",
                409,
                true,
              );
            }
            throw e;
          }
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
