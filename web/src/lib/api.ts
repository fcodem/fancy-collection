import { NextResponse } from "next/server";
import { getCurrentUser, getCurrentUserReadOnly, isOwner, AuthUser } from "./auth";

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function requireUser(): Promise<AuthUser | NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return jsonError("Please log in to continue.", 401);
  }
  return user;
}

export async function requireUserReadOnly(): Promise<AuthUser | NextResponse> {
  const user = await getCurrentUserReadOnly();
  if (!user) return jsonError("Please log in to continue.", 401);
  return user;
}

export async function requireOwner(): Promise<AuthUser | NextResponse> {
  const user = await getCurrentUser();
  if (!user) return jsonError("Please log in to continue.", 401);
  if (!isOwner(user)) return jsonError("Access denied. Owner permission required.", 403);
  return user;
}

export function isResponse(v: unknown): v is NextResponse {
  return v instanceof NextResponse;
}
