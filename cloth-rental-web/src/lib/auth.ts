import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { prisma } from "./db";
import { verifyPassword, hashPassword } from "./password";

export const SESSION_COOKIE = "rental_session_id";
export const PENDING_LOGIN_COOKIE = "pending_login_token";
export const LOGIN_REQUEST_TTL_MINUTES = 30;

export type AuthUser = {
  id: number;
  username: string;
  role: string;
  staffId: number | null;
  staffName?: string;
};

export async function getCurrentUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionId) return null;

  const us = await prisma.userSession.findFirst({
    where: { sessionId, active: true },
    include: { user: { include: { staff: true } } },
  });
  if (!us) return null;

  await prisma.userSession.update({
    where: { id: us.id },
    data: { lastSeen: new Date() },
  });

  return {
    id: us.user.id,
    username: us.user.username,
    role: us.user.role,
    staffId: us.user.staffId,
    staffName: us.user.staff?.name,
  };
}

export async function establishUserLogin(userId: number): Promise<string> {
  await prisma.userSession.updateMany({
    where: { userId, active: true },
    data: { active: false, endedAt: new Date() },
  });
  const sessionId = randomBytes(32).toString("hex");
  await prisma.userSession.create({
    data: { userId, sessionId, active: true },
  });
  return sessionId;
}

export async function endUserSession(sessionId?: string, endedById?: number) {
  if (!sessionId) return;
  await prisma.userSession.updateMany({
    where: { sessionId, active: true },
    data: { active: false, endedAt: new Date(), endedById: endedById ?? null },
  });
}

export async function expireOldLoginRequests() {
  const cutoff = new Date(Date.now() - LOGIN_REQUEST_TTL_MINUTES * 60 * 1000);
  await prisma.staffLoginRequest.updateMany({
    where: { status: "pending", requestedAt: { lt: cutoff } },
    data: { status: "expired" },
  });
}

export async function authenticateUser(username: string, password: string) {
  const user = await prisma.user.findFirst({
    where: { username: username.trim(), active: true },
  });
  if (!user || !verifyPassword(password, user.passwordHash)) return null;
  return user;
}

export async function createStaffLoginRequest(userId: number) {
  await expireOldLoginRequests();
  await prisma.staffLoginRequest.updateMany({
    where: { userId, status: "pending" },
    data: { status: "expired" },
  });
  const token = randomBytes(32).toString("hex");
  return prisma.staffLoginRequest.create({
    data: { userId, token },
  });
}

export async function ensureOwnerExists() {
  const owner = await prisma.user.findFirst({ where: { role: "owner" } });
  if (owner) return;
  const pwd = process.env.OWNER_DEFAULT_PASSWORD || "admin123";
  await prisma.user.create({
    data: {
      username: "owner",
      role: "owner",
      passwordHash: hashPassword(pwd),
    },
  });
}

export function requireUser(user: AuthUser | null): AuthUser {
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
}

export function requireOwner(user: AuthUser | null): AuthUser {
  const u = requireUser(user);
  if (u.role !== "owner") throw new Error("FORBIDDEN");
  return u;
}

export function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
