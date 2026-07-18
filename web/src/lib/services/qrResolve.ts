import { createHash } from "crypto";
import prisma from "@/lib/prisma";
import { verifyBookingQrSignature } from "@/lib/bookingQr";
import {
  normalizeQrTarget,
  qrTargetPath,
  type QrTarget,
} from "@/lib/bookingQrClient";

/**
 * Secure, lean QR resolver shared by:
 *   POST /api/booking/qr/resolve  (in-app scanner)
 *   /booking/qr/[token]           (printed-bill URL)
 *
 * Order is security-critical: normalize → allowlist → verify HMAC → (only then) DB.
 * It never backfills, assigns tokens, mutates, loads relations, or imports AI/PDF.
 */

/**
 * SECURITY / FRESHNESS CONTRACT:
 *   - The cache maps ONLY `hashed signed token → booking id`. It never stores
 *     booking status, ownership, or any authorization decision.
 *   - Authentication is NOT performed here and is NOT cached. Every caller
 *     (API route + printed-URL page) authenticates on EVERY request, so a cache
 *     hit can never let a logged-out / force-logged-out user reuse a result, and
 *     one user's request can never reuse another user's auth.
 *   - Destination is derived from the request `target` + booking id, never from
 *     a cached status, so a booking delivered/returned after caching can never be
 *     sent to a stale destination. The final record route performs the
 *     authoritative status/permission checks.
 *   - TTL is short and the whole cache is flushed on any booking mutation via
 *     `clearQrResolveCache()` (wired into cacheInvalidation).
 */
export type QrResolveOutcome =
  | { ok: true; bookingId: number; target: QrTarget; url: string; cacheStatus: "hit" | "miss" | "coalesced" }
  | { ok: false; reason: "invalid_signature" | "not_found"; cacheStatus: "bypass" };

export type QrResolveTimings = {
  signatureMs: number;
  resolverDbMs: number;
  cacheStatus: "hit" | "miss" | "coalesced" | "bypass";
};

/** Cached value is intentionally ONLY the booking id — never status/permissions. */
type CachedBooking = { bookingId: number };

/** Injectable finder for tests; production uses the lean unique-index Prisma lookup. */
export type QrBookingFinder = (token: string) => Promise<CachedBooking | null>;

const prismaFinder: QrBookingFinder = async (token) => {
  const row = await prisma.booking.findUnique({
    where: { qrToken: token },
    select: { id: true },
  });
  return row ? { bookingId: row.id } : null;
};

// Short TTL keeps the token→id mapping fresh; status is never cached, and the
// whole cache is flushed on booking mutations (clearQrResolveCache).
const CACHE_TTL_MS = 30_000;
const CACHE_MAX = 1_000;
const cache = new Map<string, { value: CachedBooking; expiresAt: number }>();
const inflight = new Map<string, Promise<CachedBooking | null>>();

/** Hash the verified token so raw tokens/signatures are never used as map keys. */
function tokenCacheKey(token: string): string {
  return createHash("sha256").update(`qr:${token}`).digest("hex");
}

function pruneCache() {
  if (cache.size <= CACHE_MAX) return;
  const now = Date.now();
  for (const [k, v] of cache) {
    if (v.expiresAt <= now) cache.delete(k);
  }
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/** Lean unique-index lookup only. Coalesces simultaneous identical resolves. */
async function lookupBookingByToken(
  token: string,
  finder: QrBookingFinder,
): Promise<{ booking: CachedBooking | null; cacheStatus: "hit" | "miss" | "coalesced" }> {
  const key = tokenCacheKey(token);
  const now = Date.now();

  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) {
    return { booking: cached.value, cacheStatus: "hit" };
  }

  const existing = inflight.get(key);
  if (existing) {
    const booking = await existing;
    return { booking, cacheStatus: "coalesced" };
  }

  const loader = finder(token);

  inflight.set(key, loader);
  try {
    const booking = await loader;
    if (booking) {
      cache.set(key, { value: booking, expiresAt: Date.now() + CACHE_TTL_MS });
      pruneCache();
    }
    return { booking, cacheStatus: "miss" };
  } finally {
    inflight.delete(key);
  }
}

/**
 * Resolve a signed QR token to a destination URL.
 * `signatureVerified` short-circuits when the caller already verified (printed-URL page).
 */
export async function resolveBookingQr(
  input: {
    token: string;
    signature?: string | null;
    target?: string | null;
    signatureVerified?: boolean;
  },
  deps?: { findBooking?: QrBookingFinder },
): Promise<{ outcome: QrResolveOutcome; timings: QrResolveTimings }> {
  const token = (input.token || "").trim();
  const target = normalizeQrTarget(input.target);
  const finder = deps?.findBooking ?? prismaFinder;

  const sigStart = Date.now();
  const verified =
    input.signatureVerified === true ||
    verifyBookingQrSignature(token, input.signature);
  const signatureMs = Date.now() - sigStart;

  if (!token || !verified) {
    return {
      outcome: { ok: false, reason: "invalid_signature", cacheStatus: "bypass" },
      timings: { signatureMs, resolverDbMs: 0, cacheStatus: "bypass" },
    };
  }

  const dbStart = Date.now();
  const { booking, cacheStatus } = await lookupBookingByToken(token, finder);
  const resolverDbMs = Date.now() - dbStart;

  if (!booking) {
    return {
      outcome: { ok: false, reason: "not_found", cacheStatus: "bypass" },
      timings: { signatureMs, resolverDbMs, cacheStatus: "bypass" },
    };
  }

  return {
    outcome: {
      ok: true,
      bookingId: booking.bookingId,
      target,
      url: qrTargetPath(target, booking.bookingId),
      cacheStatus,
    },
    timings: { signatureMs, resolverDbMs, cacheStatus },
  };
}

/** Test/maintenance hook — clears the short-lived resolver cache. */
export function clearQrResolveCache() {
  cache.clear();
  inflight.clear();
}
