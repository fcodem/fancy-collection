import { NextResponse } from "next/server";
import { allLimit } from "@/lib/concurrency";
import { jsonError, jsonOk, requireOwner, isResponse } from "@/lib/api";

export const FINANCE_READ_TIMEOUT_MS = 25_000;

export async function requireFinanceOwner() {
  return requireOwner();
}

export async function withFinanceTimeout<T>(
  promise: Promise<T>,
  label = "Finance request",
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${FINANCE_READ_TIMEOUT_MS}ms`)),
          FINANCE_READ_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Run independent finance read queries with pool-safe concurrency. */
export async function financeParallelLimit<T>(
  tasks: Array<() => Promise<T>>,
): Promise<T[]> {
  return allLimit(tasks, 2);
}

export function normalizeFinancePayload(data: unknown): unknown {
  if (data == null) return {};
  if (Array.isArray(data)) return data;
  if (typeof data === "object") return data;
  return { value: data };
}

export async function handleFinanceGet(
  fn: () => Promise<unknown>,
  label = "Finance request",
): Promise<NextResponse> {
  const user = await requireFinanceOwner();
  if (isResponse(user)) return user;

  try {
    const data = await withFinanceTimeout(fn(), label);
    return jsonOk(normalizeFinancePayload(data));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load finance data";
    const timedOut = /timed out/i.test(message);
    return jsonError(message, timedOut ? 504 : 500, { retryable: true });
  }
}
