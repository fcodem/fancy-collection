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

export interface SessionData {
  userId?: number;
  sessionId?: string;
  pendingLoginToken?: string;
}

function resolveSessionPassword(): string {
  const secret = process.env.SESSION_SECRET?.trim();
  const duringBuild =
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.NEXT_PHASE === "phase-export" ||
    process.argv.includes("build");

  if (secret && secret.length >= 32) return secret;

  if (duringBuild) {
    console.warn(
      "[auth] SESSION_SECRET missing/short during build; set a 32+ char value in Vercel Production env.",
    );
    return "build-placeholder-session-secret-min-32-chars!!";
  }

  if (secret && secret.length > 0) {
    console.warn(
      "[auth] SESSION_SECRET is shorter than 32 chars; padding so login can work. Prefer a 32+ char secret.",
    );
    return (secret + "pad-fancy-collection-session-secret-32").slice(0, 48);
  }

  if (process.env.NODE_ENV === "production") {
    // Do not hard-crash login/API if env was forgotten — still warn loudly.
    console.error(
      "[auth] SESSION_SECRET is missing in production. Using temporary fallback. Set SESSION_SECRET (32+ chars) in Vercel and redeploy.",
    );
    return "INSECURE-fallback-set-SESSION_SECRET-in-vercel-now!!";
  }

  return "dev-only-change-in-production-min-32-chars!!";
}

export const sessionOptions: SessionOptions = {
  // iron-session requires password length >= 32
  password: resolveSessionPassword(),
  cookieName: "fancy_collection_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production"
      ? process.env.SESSION_COOKIE_SECURE !== "false"
      : false,
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
  },
};

const LAST_SEEN_INTERVAL_MS = 60_000;
const lastSeenAt = new Map<string, number>();
let lastExpireLoginRequestsAt = 0;

export async function getSession() {
  await connection();
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}

async function resolveSessionUser(updateLastSeen: boolean) {
  const session = await getSession();
  if (!session.userId || !session.sessionId) return null;

  const userSession = await prisma.userSession.findFirst({
    where: { sessionId: session.sessionId, userId: session.userId, active: true },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          role: true,
          staffId: true,
          staff: { select: { id: true, name: true, active: true } },
        },
      },
    },
  });
  if (!userSession) return null;

  if (updateLastSeen) {
    const now = Date.now();
    const key = session.sessionId;
    if (now - (lastSeenAt.get(key) || 0) >= LAST_SEEN_INTERVAL_MS) {
      lastSeenAt.set(key, now);
      void prisma.userSession
        .update({
          where: { id: userSession.id },
          data: { lastSeen: new Date() },
        })
        .catch(() => {});
    }
  }

  return userSession.user;
}

export const getCurrentUser = cache(async () => resolveSessionUser(true));

export const getCurrentUserReadOnly = cache(async () => resolveSessionUser(false));

async function createUserSessionRecord(userId: number) {
  await prisma.userSession.updateMany({
    where: { userId, active: true },
    data: { active: false, endedAt: new Date() },
  });
  const sessionId = uuidv4().replace(/-/g, "");
  await prisma.userSession.create({ data: { userId, sessionId, active: true } });
  return sessionId;
}

export async function establishUserLogin(userId: number) {
  const session = await getSession();
  const sessionId = await createUserSessionRecord(userId);
  session.userId = userId;
  session.sessionId = sessionId;
  delete session.pendingLoginToken;
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
  const sessionId = await createUserSessionRecord(userId);
  const session = await getIronSession<SessionData>(req, response, sessionOptions);
  session.userId = userId;
  session.sessionId = sessionId;
  delete session.pendingLoginToken;
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
  const sessionId = await createUserSessionRecord(userId);
  const session = await getIronSession<SessionData>(req, response, sessionOptions);
  session.userId = userId;
  session.sessionId = sessionId;
  delete session.pendingLoginToken;
  await session.save();
  return response;
}

/** Staff pending login — bind pending token to redirect or JSON response. */
export async function establishPendingLoginToken(
  req: NextRequest,
  token: string,
  response: NextResponse,
) {
  const session = await getIronSession<SessionData>(req, response, sessionOptions);
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
      data: { active: false, endedAt: new Date(), endedById: endedById || null },
    });
  }
  if (!sessionId) {
    session.destroy();
  }
}

export async function findUserForLogin(identifier: string) {
  const trimmed = identifier.trim();
  if (!trimmed) return null;

  const byUsername = await prisma.user.findFirst({
    where: {
      active: true,
      OR: [
        { username: trimmed },
        { username: { equals: trimmed, mode: "insensitive" } },
      ],
    },
  });
  if (byUsername) return byUsername;

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

export function isOwner(user: AuthUser | null): boolean {
  return user?.role === "owner";
}
