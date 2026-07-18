import { NextResponse } from "next/server";
import {
  getCurrentUser,
  getFastReadUserResult,
  isOwner,
  AuthUser,
} from "./auth";
import type { PerfTimer } from "./perfTiming";

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function jsonError(
  message: string,
  status = 400,
  extra?: { code?: string; retryable?: boolean },
) {
  return NextResponse.json(
    {
      error: message,
      ...(extra?.code ? { code: extra.code } : {}),
      ...(typeof extra?.retryable === "boolean" ? { retryable: extra.retryable } : {}),
    },
    { status },
  );
}

export async function requireUser(): Promise<AuthUser | NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return jsonError("Please log in to continue.", 401);
  }
  return user;
}

/**
 * Fast read-only auth. Mutations must use requireUser/requireOwner instead.
 * Optional timer receives cookie/cache/DB stages without exposing session IDs.
 */
export async function requireFastReadUser(
  perf?: PerfTimer,
): Promise<AuthUser | NextResponse> {
  const { user, timings } = await getFastReadUserResult();
  perf?.set("cookieDecryptMs", timings.cookieDecryptMs);
  perf?.set("sessionCacheMs", timings.sessionCacheMs);
  perf?.set("sessionDbMs", timings.sessionDbMs);
  perf?.set("authTotalMs", timings.authTotalMs);
  perf?.set("authMs", timings.authTotalMs);
  perf?.setAuthCacheStatus(timings.cacheStatus);
  if (!user) return jsonError("Please log in to continue.", 401);
  return user;
}

/** @deprecated Use requireFastReadUser for explicit read-only routing. */
export const requireUserReadOnly = requireFastReadUser;

export async function requireOwner(): Promise<AuthUser | NextResponse> {
  const user = await getCurrentUser();
  if (!user) return jsonError("Please log in to continue.", 401);
  if (!isOwner(user)) return jsonError("Access denied. Owner permission required.", 403);
  return user;
}

export function isResponse(v: unknown): v is NextResponse {
  return v instanceof NextResponse;
}

export function requireJsonContentType(req: import("next/server").NextRequest): Response | null {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) {
    return jsonError("Unsupported Media Type", 415);
  }
  return null;
}

export function requireOperationId(raw: unknown): string | NextResponse {
  const id = typeof raw === "string" ? raw.trim() : "";
  if (!id || id.length < 8) {
    return jsonError("operation_id is required", 400, {
      code: "INVALID_OPERATION_ID",
      retryable: false,
    });
  }
  return id;
}
