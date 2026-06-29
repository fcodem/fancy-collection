import { NextRequest, NextResponse, after } from "next/server";
import prisma from "@/lib/prisma";
import {
  createStaffLoginRequest,
  establishPendingLoginToken,
  establishUserLoginWithJson,
  establishUserLoginWithRedirect,
  findRecentApprovedStaffLogin,
  findUserForLogin,
  upgradePasswordHashIfNeeded,
  verifyPassword,
} from "@/lib/auth";
import { jsonError } from "@/lib/api";
import {
  checkLoginBlocked,
  getClientIpFromRequest,
  loginBlockedMessage,
  recordLoginAttempt,
} from "@/lib/loginRateLimit";

async function parseCredentials(req: NextRequest) {
  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = await req.json();
    return {
      username: String(body.username || "").trim(),
      password: String(body.password || ""),
    };
  }
  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    return {
      username: String(form.get("username") || "").trim(),
      password: String(form.get("password") || ""),
    };
  }
  return { username: "", password: "" };
}

function wantsHtmlRedirect(req: NextRequest) {
  const contentType = req.headers.get("content-type") || "";
  return !contentType.includes("application/json");
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIpFromRequest(req);
    const blocked = await checkLoginBlocked(ip);
    if (blocked.blocked) {
      const msg = loginBlockedMessage(blocked.retryAfterMinutes ?? 60);
      if (wantsHtmlRedirect(req)) {
        return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent("blocked")}`, req.url));
      }
      return jsonError(msg, 429);
    }

    const { username, password } = await parseCredentials(req);
    const htmlRedirect = wantsHtmlRedirect(req);

    if (!username || !password) {
      if (htmlRedirect) {
        return NextResponse.redirect(new URL("/login?error=missing", req.url));
      }
      return jsonError("Username and password required.");
    }

    const user = await findUserForLogin(username);
    if (!user || !user.active) {
      await recordLoginAttempt(ip, false, username);
      if (htmlRedirect) {
        return NextResponse.redirect(new URL("/login?error=invalid", req.url));
      }
      return jsonError("Invalid username or password.");
    }
    if (!(await verifyPassword(password, user.passwordHash))) {
      await recordLoginAttempt(ip, false, username);
      if (htmlRedirect) {
        return NextResponse.redirect(new URL("/login?error=invalid", req.url));
      }
      return jsonError("Invalid username or password.");
    }

    await recordLoginAttempt(ip, true, username);
    after(() => upgradePasswordHashIfNeeded(user.id, password, user.passwordHash));

    if (user.role === "owner") {
      if (htmlRedirect) {
        return establishUserLoginWithRedirect(user.id, req, "/");
      }
      return establishUserLoginWithJson(user.id, req, { ok: true, role: "owner", redirect: "/" });
    }

    const approved = await findRecentApprovedStaffLogin(user.id);
    if (approved) {
      await prisma.staffLoginRequest.update({
        where: { id: approved.id },
        data: { status: "completed" },
      });
      if (htmlRedirect) {
        return establishUserLoginWithRedirect(user.id, req, "/");
      }
      return establishUserLoginWithJson(user.id, req, { ok: true, role: "staff", redirect: "/" });
    }

    const reqRow = await createStaffLoginRequest(user.id);
    const pendingUrl = new URL("/login/pending", req.url);
    pendingUrl.searchParams.set("t", reqRow.token);
    if (htmlRedirect) {
      const response = NextResponse.redirect(pendingUrl);
      return establishPendingLoginToken(req, reqRow.token, response);
    }
    const response = NextResponse.json({
      ok: true,
      role: "staff",
      pending: true,
      redirect: pendingUrl.pathname + pendingUrl.search,
    });
    return establishPendingLoginToken(req, reqRow.token, response);
  } catch (e) {
    console.error(e);
    return jsonError("Login failed.", 500);
  }
}
