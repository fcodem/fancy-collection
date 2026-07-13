import { headers } from "next/headers";
import prisma from "./prisma";

const FAIL_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const BLOCK_DURATION_MS = 60 * 60 * 1000;

export async function getClientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return h.get("x-real-ip") || h.get("cf-connecting-ip") || "unknown";
}

export function getClientIpFromRequest(req: { headers: Headers }): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return req.headers.get("x-real-ip") || req.headers.get("cf-connecting-ip") || "unknown";
}

export async function checkLoginBlocked(
  ip: string,
  username?: string,
): Promise<{ blocked: boolean; retryAfterMinutes?: number }> {
  try {
    const cutoff = new Date(Date.now() - FAIL_WINDOW_MS);
    const byIp = await prisma.loginAttempt.findMany({
      where: { ip, success: false, createdAt: { gte: cutoff } },
      orderBy: { createdAt: "desc" },
      take: MAX_FAILURES,
    });

    const userKey = username?.trim().toLowerCase() || "";
    const byUser = userKey
      ? await prisma.loginAttempt.findMany({
          where: {
            success: false,
            createdAt: { gte: cutoff },
            username: { equals: userKey, mode: "insensitive" },
          },
          orderBy: { createdAt: "desc" },
          take: MAX_FAILURES,
        })
      : [];

    const recentFailures = byIp.length >= byUser.length ? byIp : byUser;
    if (recentFailures.length < MAX_FAILURES) {
      return { blocked: false };
    }

    const fifthFailure = recentFailures[MAX_FAILURES - 1];
    const blockUntil = fifthFailure.createdAt.getTime() + BLOCK_DURATION_MS;
    const remaining = blockUntil - Date.now();

    if (remaining > 0) {
      return { blocked: true, retryAfterMinutes: Math.ceil(remaining / 60_000) };
    }

    return { blocked: false };
  } catch (e) {
    console.error("[loginRateLimit] checkLoginBlocked failed closed:", e);
    return { blocked: true, retryAfterMinutes: 5 };
  }
}

export async function recordLoginAttempt(ip: string, success: boolean, username?: string) {
  try {
    await prisma.loginAttempt.create({
      data: { ip, success, username: username || null },
    });

    if (success) {
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      await prisma.loginAttempt.deleteMany({
        where: { ip, createdAt: { lt: dayAgo } },
      }).catch(() => {});
    }
  } catch (e) {
    console.warn("[loginRateLimit] recordLoginAttempt skipped:", e);
  }
}

export function loginBlockedMessage(retryAfterMinutes: number) {
  return `Too many failed login attempts. Please try again in ${retryAfterMinutes} minute${retryAfterMinutes === 1 ? "" : "s"}.`;
}
