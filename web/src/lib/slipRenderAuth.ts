// Server-only by construction (node:crypto). Imported only by the internal
// render route and the server-only slip caller.
import { createHmac, randomUUID, timingSafeEqual, createHash } from "node:crypto";
import { getPdfRenderSecret } from "@/lib/slipPdfAccess";

/**
 * Authenticated, replay-resistant signing for the ONE internal Chromium slip
 * renderer (`POST /api/internal/slip/render`).
 *
 * A request is signed with an HMAC over `timestamp.nonce.bodyHash`, so a
 * captured request cannot be replayed (nonce + short expiry) or tampered with
 * (body hash). Comparison is timing-safe. This replaces the previous plain
 * shared-secret string compare.
 */

export const SLIP_TS_HEADER = "x-slip-ts";
export const SLIP_NONCE_HEADER = "x-slip-nonce";
export const SLIP_SIG_HEADER = "x-slip-sig";
export const SLIP_BODYHASH_HEADER = "x-slip-bodyhash";

/** Max clock skew / in-flight age for a signed render request. */
const MAX_AGE_MS = 120_000;
/** Bounded per-instance replay guard. */
const NONCE_TTL_MS = MAX_AGE_MS + 30_000;
const MAX_NONCES = 5_000;

const seenNonces = new Map<string, number>();

function pruneNonces(now: number) {
  if (seenNonces.size < MAX_NONCES) {
    // Cheap opportunistic prune of expired entries.
    for (const [nonce, expiry] of seenNonces) {
      if (expiry <= now) seenNonces.delete(nonce);
    }
    return;
  }
  // Hard cap: drop oldest half to stay bounded.
  const entries = [...seenNonces.entries()].sort((a, b) => a[1] - b[1]);
  for (let i = 0; i < entries.length / 2; i += 1) {
    seenNonces.delete(entries[i]![0]);
  }
}

export function hashRenderBody(rawBody: string): string {
  return createHash("sha256").update(rawBody, "utf8").digest("hex");
}

function computeSignature(secret: string, ts: string, nonce: string, bodyHash: string): string {
  return createHmac("sha256", secret)
    .update(`${ts}.${nonce}.${bodyHash}`, "utf8")
    .digest("base64url");
}

/** Build signed headers for a render request body (server-to-server caller). */
export function buildSlipRenderAuthHeaders(rawBody: string): Record<string, string> {
  const secret = getPdfRenderSecret();
  if (!secret) {
    throw new Error("PDF_RENDER_SECRET or CRON_SECRET must be set for slip PDF generation.");
  }
  const ts = String(Date.now());
  const nonce = randomUUID();
  const bodyHash = hashRenderBody(rawBody);
  const sig = computeSignature(secret, ts, nonce, bodyHash);
  return {
    [SLIP_TS_HEADER]: ts,
    [SLIP_NONCE_HEADER]: nonce,
    [SLIP_BODYHASH_HEADER]: bodyHash,
    [SLIP_SIG_HEADER]: sig,
  };
}

type VerifyInput = {
  ts: string | null;
  nonce: string | null;
  sig: string | null;
  bodyHash: string | null;
  rawBody: string;
};

export type VerifyResult = { ok: true } | { ok: false; reason: string };

/** Authoritatively verify a signed render request. No booking work on failure. */
export function verifySlipRenderAuth(input: VerifyInput): VerifyResult {
  const secret = getPdfRenderSecret();
  if (!secret) return { ok: false, reason: "no_secret" };

  const { ts, nonce, sig, bodyHash, rawBody } = input;
  if (!ts || !nonce || !sig) return { ok: false, reason: "missing_headers" };

  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) return { ok: false, reason: "bad_timestamp" };
  const now = Date.now();
  if (Math.abs(now - tsNum) > MAX_AGE_MS) return { ok: false, reason: "expired" };

  const actualBodyHash = hashRenderBody(rawBody);
  if (bodyHash && bodyHash !== actualBodyHash) return { ok: false, reason: "body_mismatch" };

  const expectedSig = computeSignature(secret, ts, nonce, actualBodyHash);
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad_signature" };
  }

  pruneNonces(now);
  if (seenNonces.has(nonce)) return { ok: false, reason: "replay" };
  seenNonces.set(nonce, now + NONCE_TTL_MS);

  return { ok: true };
}

/** Test-only: clear the replay guard between cases. */
export function __resetSlipRenderNonces(): void {
  seenNonces.clear();
}
