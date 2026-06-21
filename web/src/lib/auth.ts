import { cache } from "react";
import { connection } from "next/server";
import { getIronSession, SessionOptions } from "iron-session";
import { cookies } from "next/headers";
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

export const sessionOptions: SessionOptions = {
  password: (() => {
    if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
      throw new Error(
        "SESSION_SECRET environment variable must be set in production. " +
        "Generate one with: openssl rand -base64 32"
      );
    }
    return process.env.SESSION_SECRET || "dev-only-change-in-production-min-32-chars!!";
  })(),
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

export async function establishUserLogin(userId: number) {
  const session = await getSession();
  await prisma.userSession.updateMany({
    where: { userId, active: true },
    data: { active: false, endedAt: new Date() },
  });
  const sessionId = uuidv4().replace(/-/g, "");
  await prisma.userSession.create({ data: { userId, sessionId, active: true } });
  session.userId = userId;
  session.sessionId = sessionId;
  delete session.pendingLoginToken;
  await session.save();
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
