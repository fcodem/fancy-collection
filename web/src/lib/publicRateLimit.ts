import "server-only";

import { createHash, randomBytes } from "crypto";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

function keyHash(key: string): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 32);
}

/** Simple in-memory IP/route rate limit for public endpoints (per isolate). */
export function consumeRateLimit(
  key: string,
  opts: { limit: number; windowMs: number },
): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  const id = keyHash(key);
  const existing = buckets.get(id);
  if (!existing || existing.resetAt <= now) {
    buckets.set(id, { count: 1, resetAt: now + opts.windowMs });
    return { ok: true };
  }
  if (existing.count >= opts.limit) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) };
  }
  existing.count += 1;
  return { ok: true };
}

export function newPublicAccessToken(): string {
  return randomBytes(32).toString("base64url");
}
