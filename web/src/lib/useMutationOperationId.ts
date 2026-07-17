"use client";

import { useCallback, useRef } from "react";
import { generateUuidV4 } from "@/lib/clientUuid";

/**
 * Stable operation_id for mutation retries.
 * - Same id until confirmed success (or deliberate payload change after failure)
 * - Synchronous submittingRef prevents double-clicks
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
      // User changed the mutation after a failed attempt — new id
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
    // Keep operationId for network retry with same payload
  }, []);

  const peek = useCallback(() => operationIdRef.current, []);

  const isSubmitting = useCallback(() => submittingRef.current, []);

  return { begin, succeed, fail, peek, isSubmitting, submittingRef, operationIdRef };
}
