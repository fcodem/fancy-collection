"use client";

import { useCallback, useRef } from "react";
import { generateUuidV4 } from "@/lib/clientUuid";

export type MutationApiError = {
  error?: string;
  code?: string;
  retryable?: boolean;
};

/**
 * Stable operation_id for mutation retries.
 * - Same id until confirmed success (or deliberate payload change)
 * - Keep id on OPERATION_IN_PROGRESS and network failure
 * - Clear only after confirmed success
 * - New id after deliberate payload change
 */
export function useMutationOperationId() {
  const operationIdRef = useRef<string | null>(null);
  const submittingRef = useRef(false);
  const lastPayloadKeyRef = useRef<string | null>(null);

  const begin = useCallback((payloadKey?: string) => {
    if (submittingRef.current) return null;
    if (
      payloadKey &&
      lastPayloadKeyRef.current &&
      lastPayloadKeyRef.current !== payloadKey &&
      operationIdRef.current
    ) {
      operationIdRef.current = null;
    }
    if (payloadKey) lastPayloadKeyRef.current = payloadKey;
    if (!operationIdRef.current) operationIdRef.current = generateUuidV4();
    submittingRef.current = true;
    return operationIdRef.current;
  }, []);

  const succeed = useCallback(() => {
    operationIdRef.current = null;
    lastPayloadKeyRef.current = null;
    submittingRef.current = false;
  }, []);

  const fail = useCallback((opts?: { clearId?: boolean }) => {
    submittingRef.current = false;
    if (opts?.clearId) {
      operationIdRef.current = null;
      lastPayloadKeyRef.current = null;
    }
  }, []);

  /** Clear id only for non-retryable payload/failed codes — not for every 409. */
  const failFromApi = useCallback((err: MutationApiError | null | undefined) => {
    submittingRef.current = false;
    const code = err?.code;
    if (
      code === "OPERATION_PAYLOAD_MISMATCH" ||
      code === "OPERATION_PREVIOUSLY_FAILED" ||
      code === "INVALID_OPERATION_ID"
    ) {
      operationIdRef.current = null;
      lastPayloadKeyRef.current = null;
    }
  }, []);

  const peek = useCallback(() => operationIdRef.current, []);
  const isSubmitting = useCallback(() => submittingRef.current, []);

  return {
    begin,
    succeed,
    fail,
    failFromApi,
    peek,
    isSubmitting,
    submittingRef,
    operationIdRef,
  };
}

/** Controlled polling when server returns OPERATION_IN_PROGRESS. */
export async function fetchWithOperationInProgressRetry(
  input: RequestInfo | URL,
  init: RequestInit,
  opts?: { maxAttempts?: number; delayMs?: number; onRetry?: (attempt: number) => void },
): Promise<Response> {
  const maxAttempts = opts?.maxAttempts ?? 4;
  const delayMs = opts?.delayMs ?? 700;
  let last: Response | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    last = await fetch(input, init);
    if (last.status !== 409) return last;
    let body: MutationApiError | null = null;
    try {
      body = (await last.clone().json()) as MutationApiError;
    } catch {
      return last;
    }
    if (body?.code !== "OPERATION_IN_PROGRESS" || !body.retryable) return last;
    if (attempt === maxAttempts) return last;
    opts?.onRetry?.(attempt);
    await new Promise((r) => setTimeout(r, delayMs * attempt));
  }
  return last!;
}
