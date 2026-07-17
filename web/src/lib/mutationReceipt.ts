import "server-only";

import prisma from "@/lib/prisma";
import { assertSamePayloadOrThrow, hashRequestPayload } from "@/lib/mutationIdempotency";

export type MutationReceiptStatus = "processing" | "completed" | "failed";

export class MutationIdempotencyError extends Error {
  readonly code:
    | "PAYLOAD_MISMATCH"
    | "IN_PROGRESS"
    | "FAILED"
    | "SCHEMA_UNAVAILABLE"
    | "INVALID";
  readonly httpStatus: number;

  constructor(
    code: MutationIdempotencyError["code"],
    message: string,
    httpStatus: number,
  ) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export type IdempotentMutationOpts = {
  operationId: string;
  operationType: string;
  bookingId?: number | null;
  actorUserId?: number | null;
  /** Canonical payload used for hashing (no PII extras). */
  payload: unknown;
};

type ClaimOutcome =
  | { kind: "execute" }
  | { kind: "reuse"; result: unknown }
  | { kind: "unavailable" };

/**
 * Atomically claim a mutation receipt (INSERT processing).
 * On unique conflict, re-read under interpretation of completed/processing/failed.
 */
async function claimMutationReceipt(opts: IdempotentMutationOpts): Promise<ClaimOutcome> {
  const requestHash = hashRequestPayload(opts.payload);
  try {
    await prisma.mutationReceipt.create({
      data: {
        operationId: opts.operationId,
        operationType: opts.operationType,
        bookingId: opts.bookingId ?? null,
        actorUserId: opts.actorUserId ?? null,
        requestHash,
        status: "processing",
      },
    });
    return { kind: "execute" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    const code = (e as { code?: string })?.code;
    if (/does not exist|Unknown arg|mutation_receipts/i.test(msg) || code === "P2021") {
      return { kind: "unavailable" };
    }
    if (code !== "P2002" && !/Unique constraint/i.test(msg)) {
      throw e;
    }
  }

  const existing = await prisma.mutationReceipt.findUnique({
    where: { operationId: opts.operationId },
  });
  if (!existing) {
    // Race: lost between conflict and find — try once more to claim
    return claimMutationReceipt(opts);
  }

  try {
    assertSamePayloadOrThrow(existing.requestHash, opts.payload);
  } catch {
    throw new MutationIdempotencyError(
      "PAYLOAD_MISMATCH",
      "operation_id was already used with a different payload",
      409,
    );
  }

  if (existing.status === "completed" && existing.resultJson != null) {
    return { kind: "reuse", result: existing.resultJson };
  }
  if (existing.status === "processing") {
    throw new MutationIdempotencyError(
      "IN_PROGRESS",
      "This operation is already being processed. Wait a moment and retry with the same operation_id.",
      409,
    );
  }
  if (existing.status === "failed") {
    throw new MutationIdempotencyError(
      "FAILED",
      "This operation_id previously failed. Start a new operation_id for a fresh attempt.",
      409,
    );
  }
  // Legacy rows may use default "completed" without result
  if (existing.resultJson != null) {
    return { kind: "reuse", result: existing.resultJson };
  }
  throw new MutationIdempotencyError(
    "IN_PROGRESS",
    "This operation_id is reserved. Retry shortly with the same id.",
    409,
  );
}

async function completeMutationReceipt(
  operationId: string,
  result: unknown,
): Promise<void> {
  try {
    await prisma.mutationReceipt.update({
      where: { operationId },
      data: {
        status: "completed",
        resultJson: result as object,
        completedAt: new Date(),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (/does not exist|P2021/i.test(msg)) return;
    console.error("[mutationReceipt] complete failed:", msg.slice(0, 120));
  }
}

async function failMutationReceipt(operationId: string, errorMessage: string): Promise<void> {
  try {
    await prisma.mutationReceipt.update({
      where: { operationId },
      data: {
        status: "failed",
        resultJson: { error: errorMessage.slice(0, 500) },
        completedAt: new Date(),
      },
    });
  } catch {
    /* ignore */
  }
}

/**
 * Run a business mutation at most once per operation_id.
 * Claim happens BEFORE mutate. Same id+payload returns stored result.
 */
export async function runIdempotentMutation<T>(
  opts: IdempotentMutationOpts,
  mutate: () => Promise<T>,
): Promise<{ result: T; reused: boolean }> {
  if (!opts.operationId?.trim()) {
    const result = await mutate();
    return { result, reused: false };
  }

  const claim = await claimMutationReceipt(opts);
  if (claim.kind === "reuse") {
    return { result: claim.result as T, reused: true };
  }
  if (claim.kind === "unavailable") {
    // Table not migrated yet — execute without receipt (degraded mode).
    const result = await mutate();
    return { result, reused: false };
  }

  try {
    const result = await mutate();
    await completeMutationReceipt(opts.operationId, result);
    return { result, reused: false };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "mutation failed";
    await failMutationReceipt(opts.operationId, msg);
    throw e;
  }
}

export { hashRequestPayload };
