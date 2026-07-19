import { cache } from "react";
import { connection } from "next/server";
import { getIronSession, SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import prisma from "./prisma";
import { LOGIN_REQUEST_TTL_MINUTES } from "./constants";
import { isWerkzeugHash, verifyWerkzeugPassword } from "./werkzeugPassword";
import {
  clearSessionCache,
  invalidateCachedSession,
  invalidateCachedSessionsForUser,
  hashSessionId,
  validateSessionWithCache,
  type CachedSessionIdentity,
  type SessionCacheStatus,
} from "./sessionCache";
import {
  invalidateAllSharedSessions,
  invalidateSharedSession,
  invalidateSharedSessionsForUser,
  validateSessionWithSharedCache,
  type SharedSessionCacheStatus,
  type SharedSessionValidation,
} from "./sharedReadSessionCache";

export interface SessionData {
  userId?: number;
  sessionId?: string;
  pendingLoginToken?: string;
  /** Cached on login for fast layout auth (no Prisma on navigation). */
  username?: string;
  role?: string;
  staffId?: number | null;
  sessionRevision?: number;
  sessionExpiresAt?: string;
}

export type SessionIdentity = {
  id: number;
  username: string;
  role: string;
  staffId: number | null;
  staff: null;
};

export type FastReadAuthTimings = {
  cookieDecryptMs: number;
  localCacheMs: number;
  sharedCacheMs: number;
  sessionCacheMs: number;
  sessionDbMs: number;
  authTotalMs: number;
  cacheStatus:
    | `local-${SessionCacheStatus}`
    | SharedSessionCacheStatus
    | "db-miss"
    | "bypass";
};

export type FastReadAuthResult = {
  user: (SessionIdentity & { active: true }) | null;
  timings: FastReadAuthTimings;
};

function readEnv(name: string): string {
  // Dynamic key access avoids Next.js build-time inlining of empty env values.
  try {
    return String(process.env[name] ?? "").trim();
  } catch {
    return "";
  }
}

function resolveSessionPassword(): string {
  const secret = readEnv("SESSION_SECRET");
  const duringBuild =
    readEnv("NEXT_PHASE") === "phase-production-build" ||
    readEnv("NEXT_PHASE") === "phase-export" ||
    process.argv.includes("build");

  if (secret.length >= 32) return secret;

  if (duringBuild) {
    console.warn(
      "[auth] SESSION_SECRET missing/short during build; set a 32+ char value in Vercel Production env.",
    );
    return "build-placeholder-session-secret-min-32-chars!!";
  }

  // Fail closed in production — never pad or fall back to a known string.
  if (readEnv("NODE_ENV") === "production" || readEnv("VERCEL") === "1") {
    throw new Error(
      "SESSION_SECRET must contain at least 32 random characters in production. Set it in Vercel Environment Variables and redeploy.",
    );
  }

  if (secret.length > 0) {
    console.warn(
      "[auth] SESSION_SECRET is shorter than 32 chars; padding for local/dev only. Prefer a 32+ char secret.",
    );
    return (secret + "pad-fancy-collection-session-secret-32").slice(0, 48);
  }

  return "dev-only-change-in-production-min-32-chars!!";
}

export function getSessionOptions(): SessionOptions {
  const isProd = readEnv("NODE_ENV") === "production" || readEnv("VERCEL") === "1";
  if (isProd && readEnv("SESSION_COOKIE_SECURE") === "false") {
    throw new Error("SESSION_COOKIE_SECURE=false is not allowed in production.");
  }
  return {
    // iron-session requires password length >= 32
    password: resolveSessionPassword(),
    cookieName: "fancy_collection_session",
    cookieOptions: {
      secure: isProd ? true : false,
      httpOnly: true,
      sameSite: "lax",
    },
  };
}

/** @deprecated Prefer getSessionOptions() so SESSION_SECRET is read at request time. */
export const sessionOptions: SessionOptions = getSessionOptions();

const LAST_SEEN_INTERVAL_MS = 60_000;
const lastSeenAt = new Map<string, number>();
let lastExpireLoginRequestsAt = 0;

export async function getSession() {
  await connection();
  return getIronSession<SessionData>(await cookies(), getSessionOptions());
}

async function loadActiveSessionUser(
  userId: number,
  sessionId: string,
  updateLastSeen: boolean,
  expectedRevision?: number,
) {
  const userSession = await prisma.userSession.findFirst({
    where: {
      sessionId,
      userId,
      active: true,
      expiresAt: { gt: new Date() },
      ...(expectedRevision ? { revision: expectedRevision } : {}),
    },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          role: true,
          staffId: true,
          active: true,
          staff: { select: { id: true, name: true, active: true } },
        },
      },
    },
  });
  if (!userSession || !userSession.user.active) return null;

  if (updateLastSeen) {
    const now = Date.now();
    if (now - (lastSeenAt.get(sessionId) || 0) >= LAST_SEEN_INTERVAL_MS) {
      lastSeenAt.set(sessionId, now);
      void prisma.userSession
        .update({
          where: { id: userSession.id },
          data: { lastSeen: new Date() },
        })
        .catch(() => {});
    }
  }

  return {
    user: userSession.user,
    revision: userSession.revision,
    expiresAt: userSession.expiresAt,
  };
}

async function resolveSessionUser(updateLastSeen: boolean) {
  const session = await getSession();
  if (!session.userId || !session.sessionId) return null;
  const loaded = await loadActiveSessionUser(
    session.userId,
    session.sessionId,
    updateLastSeen,
    session.sessionRevision,
  );
  return loaded?.user ?? null;
}

/**
 * Authoritative mutation path — always hits the database (request-scoped React cache
 * still dedupes identical calls within one request).
 */
export const getCurrentUser = cache(async () => resolveSessionUser(true));

/**
 * Fast read path for list/suggestion APIs:
 * 1. Decode signed Iron Session cookie (no DB)
 * 2. Validate revision/expiry through the shared 15s Data Cache gate
 * 3. Reuse bounded local identity memory and coalesce concurrent misses
 * 4. Fall back to the authoritative database on shared miss/outage
 * Force-logout / deactivation / role / password reset invalidate the cache immediately.
 */
export const getFastReadUserResult = cache(async (): Promise<FastReadAuthResult> => {
  const authStarted = performance.now();
  const cookieStarted = performance.now();
  const session = await getSession();
  const cookieDecryptMs = performance.now() - cookieStarted;
  if (!session.userId || !session.sessionId) {
    return {
      user: null,
      timings: {
        cookieDecryptMs,
        localCacheMs: 0,
        sharedCacheMs: 0,
        sessionCacheMs: 0,
        sessionDbMs: 0,
        authTotalMs: performance.now() - authStarted,
        cacheStatus: "bypass",
      },
    };
  }

  const userId = session.userId;
  const sessionId = session.sessionId;
  const cookieRevision = session.sessionRevision;
  const cookieExpiresAt = session.sessionExpiresAt;
  const cookieExpiryMs = cookieExpiresAt ? Date.parse(cookieExpiresAt) : Number.NaN;
  if (cookieExpiresAt && (!Number.isFinite(cookieExpiryMs) || cookieExpiryMs <= Date.now())) {
    return {
      user: null,
      timings: {
        cookieDecryptMs,
        localCacheMs: 0,
        sharedCacheMs: 0,
        sessionCacheMs: 0,
        sessionDbMs: 0,
        authTotalMs: performance.now() - authStarted,
        cacheStatus: "bypass",
      },
    };
  }

  const layered =
    Boolean(cookieRevision) &&
    Boolean(cookieExpiresAt) &&
    Boolean(session.username) &&
    Boolean(session.role);
  let sharedCacheMs = 0;
  let measuredDbMs = 0;
  let layeredStatus: SharedSessionCacheStatus | "db-miss" = "db-miss";
  let sharedValue: SharedSessionValidation | null = null;

  // The shared gate is checked on every revised-cookie request, including a
  // local identity hit. Therefore another function's force-logout/tag
  // invalidation cannot be bypassed by stale process memory.
  if (layered) {
    const shared = await validateSessionWithSharedCache(
      { sessionId, userId, revision: cookieRevision! },
      async (): Promise<SharedSessionValidation> => {
        const loaded = await loadActiveSessionUser(
          userId,
          sessionId,
          false,
          cookieRevision,
        );
        if (!loaded) {
          return {
            sessionHash: hashSessionId(sessionId),
            active: false,
            userId,
            role: session.role!,
            revision: cookieRevision!,
            expiresAt: cookieExpiresAt!,
          };
        }
        return {
          sessionHash: hashSessionId(sessionId),
          active: loaded.user.active,
          userId: loaded.user.id,
          role: loaded.user.role,
          revision: loaded.revision,
          expiresAt: loaded.expiresAt.toISOString(),
        };
      },
    );
    sharedCacheMs = shared.sharedCacheMs;
    measuredDbMs = shared.sessionDbMs;
    layeredStatus = shared.status;
    sharedValue = shared.value;
    if (!sharedValue?.active) {
      invalidateCachedSession(sessionId);
      return {
        user: null,
        timings: {
          cookieDecryptMs,
          localCacheMs: 0,
          sharedCacheMs,
          sessionCacheMs: 0,
          sessionDbMs: measuredDbMs,
          authTotalMs: performance.now() - authStarted,
          cacheStatus: layeredStatus,
        },
      };
    }
  }

  const validation = await validateSessionWithCache(
    sessionId,
    async () => {
      if (sharedValue) {
        return {
          id: sharedValue.userId,
          username: session.username!,
          role: sharedValue.role,
          staffId: session.staffId ?? null,
          staff: null,
          sessionRevision: sharedValue.revision,
          expiresAt: sharedValue.expiresAt,
          active: true,
        };
      }

      // Compatibility path for cookies issued before revision/expiry existed.
      const dbStarted = performance.now();
      const loaded = await loadActiveSessionUser(userId, sessionId, false);
      measuredDbMs = performance.now() - dbStarted;
      if (!loaded) return null;
      return {
        id: loaded.user.id,
        username: loaded.user.username,
        role: loaded.user.role,
        staffId: loaded.user.staffId ?? null,
        staff: null,
        sessionRevision: loaded.revision,
        expiresAt: loaded.expiresAt.toISOString(),
        active: true,
      };
    },
    userId,
  );
  const cached = validation.value;
  const cacheStatus =
    layered ? layeredStatus : (`local-${validation.status}` as const);
  const timings: FastReadAuthTimings = {
    cookieDecryptMs,
    localCacheMs: validation.cacheLookupMs,
    sharedCacheMs,
    sessionCacheMs: validation.cacheLookupMs,
    sessionDbMs: measuredDbMs,
    authTotalMs: performance.now() - authStarted,
    cacheStatus,
  };

  if (!cached) return { user: null, timings };
  // Never trust a cached identity that does not match the signed cookie user id.
  if (cached.id !== userId) {
    invalidateCachedSession(sessionId);
    return { user: null, timings };
  }
  if (
    cookieRevision &&
    (cached.sessionRevision !== cookieRevision ||
      cached.expiresAt !== cookieExpiresAt)
  ) {
    invalidateCachedSession(sessionId);
    return { user: null, timings };
  }
  return {
    user: {
      id: cached.id,
      username: cached.username,
      role: sharedValue?.role ?? cached.role,
      staffId: cached.staffId,
      active: true as const,
      staff: null,
    },
    timings,
  };
});

export const getCurrentUserReadOnly = cache(
  async () => (await getFastReadUserResult()).user,
);

async function createUserSessionRecord(userId: number) {
  await prisma.userSession.updateMany({
    where: { userId, active: true },
    data: { active: false, endedAt: new Date(), revision: { increment: 1 } },
  });
  await invalidateReadSessionCachesForUser(userId);
  const sessionId = uuidv4().replace(/-/g, "");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  return prisma.userSession.create({
    data: { userId, sessionId, active: true, revision: 1, expiresAt },
    select: { sessionId: true, revision: true, expiresAt: true },
  });
}

async function loadUserIdentityFields(userId: number) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { username: true, role: true, staffId: true },
  });
}

async function writeSessionIdentity(
  session: Awaited<ReturnType<typeof getSession>> | SessionData,
  userId: number,
  sessionRecord: { sessionId: string; revision: number; expiresAt: Date },
) {
  const user = await loadUserIdentityFields(userId);
  session.userId = userId;
  session.sessionId = sessionRecord.sessionId;
  session.sessionRevision = sessionRecord.revision;
  session.sessionExpiresAt = sessionRecord.expiresAt.toISOString();
  session.username = user?.username;
  session.role = user?.role;
  session.staffId = user?.staffId ?? null;
  delete session.pendingLoginToken;
}

/**
 * Fast cookie-only identity for protected layouts / shells.
 * Decrypts Iron Session only — no Prisma. Falls back to null if identity fields missing
 * (e.g. sessions established before this field was stored).
 */
export async function getSessionIdentityFromCookie(): Promise<SessionIdentity | null> {
  const session = await getSession();
  if (!session.userId || !session.sessionId) return null;
  if (!session.username || !session.role) return null;
  return {
    id: session.userId,
    username: session.username,
    role: session.role,
    staffId: session.staffId ?? null,
    staff: null,
  };
}

/** Layout/shell: prefer cookie identity; DB only when cookie lacks identity fields. */
export const getCurrentUserForLayout = cache(async () => {
  const fromCookie = await getSessionIdentityFromCookie();
  if (fromCookie) return fromCookie;
  return resolveSessionUser(false);
});

export async function establishUserLogin(userId: number) {
  const session = await getSession();
  const sessionRecord = await createUserSessionRecord(userId);
  await writeSessionIdentity(session, userId, sessionRecord);
  await session.save();
}

/** Route handlers must bind iron-session to the response object (cookies() alone does not set Set-Cookie on JSON/redirect). */
export async function establishUserLoginWithRedirect(
  userId: number,
  req: NextRequest,
  redirectTo: string | URL = "/",
) {
  const url = typeof redirectTo === "string" ? new URL(redirectTo, req.url) : redirectTo;
  const response = NextResponse.redirect(url);
  const sessionRecord = await createUserSessionRecord(userId);
  const session = await getIronSession<SessionData>(req, response, getSessionOptions());
  await writeSessionIdentity(session, userId, sessionRecord);
  await session.save();
  return response;
}

/** JSON login responses (LoginForm fetch) — session cookie must be on the same NextResponse. */
export async function establishUserLoginWithJson<T>(
  userId: number,
  req: NextRequest,
  body: T,
  status = 200,
) {
  const response = NextResponse.json(body, { status });
  const sessionRecord = await createUserSessionRecord(userId);
  const session = await getIronSession<SessionData>(req, response, getSessionOptions());
  await writeSessionIdentity(session, userId, sessionRecord);
  await session.save();
  return response;
}

/** Staff pending login — bind pending token to redirect or JSON response. */
export async function establishPendingLoginToken(
  req: NextRequest,
  token: string,
  response: NextResponse,
) {
  const session = await getIronSession<SessionData>(req, response, getSessionOptions());
  session.pendingLoginToken = token;
  await session.save();
  return response;
}

export async function findRecentApprovedStaffLogin(userId: number) {
  await expireOldLoginRequests();
  const cutoff = new Date(Date.now() - LOGIN_REQUEST_TTL_MINUTES * 60 * 1000);
  return prisma.staffLoginRequest.findFirst({
    where: {
      userId,
      status: "approved",
      resolvedAt: { gte: cutoff },
    },
    orderBy: { resolvedAt: "desc" },
  });
}

export async function completeStaffLoginRequest(requestId: number) {
  const reqRow = await prisma.staffLoginRequest.findUnique({
    where: { id: requestId },
    include: { user: true },
  });
  if (!reqRow || reqRow.status !== "approved" || !reqRow.user.active) return false;

  await establishUserLogin(reqRow.userId);
  await prisma.staffLoginRequest.update({
    where: { id: reqRow.id },
    data: { status: "completed" },
  });
  return true;
}

/** Complete an owner-approved staff login using the pending-page token. */
export async function completeStaffLoginByToken(token: string, req: NextRequest) {
  await expireOldLoginRequests();
  const reqRow = await prisma.staffLoginRequest.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!reqRow || reqRow.status !== "approved" || !reqRow.user.active) return null;

  const response = await establishUserLoginWithRedirect(reqRow.userId, req, "/");
  await prisma.staffLoginRequest.update({
    where: { id: reqRow.id },
    data: { status: "completed" },
  });
  return response;
}

export async function endUserSession(sessionId?: string, endedById?: number) {
  const session = await getSession();
  const sid = sessionId || session.sessionId;
  if (!sid) return;
  const row = await prisma.userSession.findFirst({ where: { sessionId: sid, active: true } });
  if (row) {
    await prisma.userSession.update({
      where: { id: row.id },
      data: {
        active: false,
        endedAt: new Date(),
        endedById: endedById || null,
        revision: { increment: 1 },
      },
    });
  }
  try {
    if (row) await invalidateReadSessionCachesForUser(row.userId);
    await invalidateReadSessionCaches(sid);
  } finally {
    if (!sessionId) session.destroy();
  }
}

/** Revoke every active DB session for a user (password change / reset / deactivation). */
export async function invalidateAllSessionsForUser(userId: number, endedById?: number) {
  await prisma.userSession.updateMany({
    where: { userId, active: true },
    data: {
      active: false,
      endedAt: new Date(),
      endedById: endedById ?? null,
      revision: { increment: 1 },
    },
  });
  await invalidateReadSessionCachesForUser(userId);
}

export async function invalidateReadSessionCaches(sessionId: string) {
  invalidateCachedSession(sessionId);
  await invalidateSharedSession(sessionId);
}

export async function invalidateReadSessionCachesForUser(userId: number) {
  invalidateCachedSessionsForUser(userId);
  await invalidateSharedSessionsForUser(userId);
}

export async function invalidateAllReadSessionCaches() {
  clearSessionCache();
  await invalidateAllSharedSessions();
}

export async function findUserForLogin(identifier: string) {
  const trimmed = identifier.trim();
  if (!trimmed) return null;

  // Avoid Prisma `mode: "insensitive"` (can fail on some Postgres/pooler setups).
  const exact = await prisma.user.findFirst({
    where: { active: true, username: trimmed },
  });
  if (exact) return exact;

  const lower = trimmed.toLowerCase();
  if (lower !== trimmed) {
    const ci = await prisma.user.findFirst({
      where: { active: true, username: lower },
    });
    if (ci) return ci;
  }

  // Also try common casing for owner.
  if (lower === "owner") {
    const owner = await prisma.user.findFirst({
      where: { active: true, username: "owner" },
    });
    if (owner) return owner;
  }

  if (/^\d+$/.test(trimmed)) {
    const staffId = parseInt(trimmed, 10);
    return prisma.user.findFirst({
      where: { active: true, staffId },
    });
  }

  return null;
}

export async function verifyPassword(password: string, hash: string) {
  if (hash.startsWith("$2a$") || hash.startsWith("$2b$") || hash.startsWith("$2y$")) {
    return bcrypt.compare(password, hash);
  }
  if (isWerkzeugHash(hash)) {
    return verifyWerkzeugPassword(password, hash);
  }
  return bcrypt.compare(password, hash);
}

/** Re-hash Flask/Werkzeug passwords to bcrypt after successful login. */
export async function upgradePasswordHashIfNeeded(userId: number, password: string, currentHash: string) {
  if (!isWerkzeugHash(currentHash)) return;
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(password) },
  });
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function expireOldLoginRequests() {
  const now = Date.now();
  if (now - lastExpireLoginRequestsAt < LAST_SEEN_INTERVAL_MS) return;
  lastExpireLoginRequestsAt = now;

  const cutoff = new Date(Date.now() - LOGIN_REQUEST_TTL_MINUTES * 60 * 1000);
  await prisma.staffLoginRequest.updateMany({
    where: { status: "pending", requestedAt: { lt: cutoff } },
    data: { status: "expired" },
  });
  await prisma.staffLoginRequest.updateMany({
    where: { status: "approved", resolvedAt: { lt: cutoff } },
    data: { status: "expired" },
  });
}

export async function createStaffLoginRequest(userId: number) {
  await expireOldLoginRequests();
  await prisma.staffLoginRequest.updateMany({
    where: { userId, status: "pending" },
    data: { status: "expired" },
  });
  const token = uuidv4().replace(/-/g, "");
  return prisma.staffLoginRequest.create({ data: { userId, token } });
}

export async function getPendingStaffLoginRequests() {
  await expireOldLoginRequests();
  return prisma.staffLoginRequest.findMany({
    where: { status: "pending" },
    include: { user: { include: { staff: true } } },
    orderBy: { requestedAt: "asc" },
  });
}

export async function getActiveStaffSessions() {
  return prisma.userSession.findMany({
    where: { active: true, user: { role: "staff" } },
    include: { user: { include: { staff: true } } },
    orderBy: { loginAt: "desc" },
  });
}

export type AuthUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export function isOwner(user: { role?: string } | null): boolean {
  return user?.role === "owner";
}
