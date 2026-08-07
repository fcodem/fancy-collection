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
    let byUser: Awaited<ReturnType<typeof prisma.loginAttempt.findMany>> = [];
    if (userKey) {
      // Avoid Prisma `mode: "insensitive"` (can fail on some pooler setups).
      byUser = await prisma.loginAttempt.findMany({
        where: {
          success: false,
          createdAt: { gte: cutoff },
          username: userKey,
        },
        orderBy: { createdAt: "desc" },
        take: MAX_FAILURES,
      });
    }

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
    // Fail open so a rate-limit DB glitch never locks everyone out.
    console.error("[loginRateLimit] checkLoginBlocked failed open:", e);
    return { blocked: false };
  }
}

export async function recordLoginAttempt(ip: string, success: boolean, username?: string) {
  try {
    const userKey = username?.trim().toLowerCase() || null;
    await prisma.loginAttempt.create({
      data: { ip, success, username: userKey },
    });

    if (success) {
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      await prisma.loginAttempt
        .deleteMany({
          where: {
            OR: [
              { ip, success: false },
              ...(userKey ? [{ username: userKey, success: false }] : []),
              { ip, createdAt: { lt: dayAgo } },
            ],
          },
        })
        .catch(() => {});
    }
  } catch (e) {
    console.warn("[loginRateLimit] recordLoginAttempt skipped:", e);
  }
}

export function loginBlockedMessage(retryAfterMinutes: number) {
  return `Too many failed login attempts. Please try again in ${retryAfterMinutes} minute${retryAfterMinutes === 1 ? "" : "s"}.`;
}
