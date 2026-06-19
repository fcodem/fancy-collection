import { NextRequest, NextResponse, after } from "next/server";
import prisma from "@/lib/prisma";
import {
  createStaffLoginRequest,
  establishUserLogin,
  getSession,
  upgradePasswordHashIfNeeded,
  verifyPassword,
} from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/api";

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
    const { username, password } = await parseCredentials(req);
    const htmlRedirect = wantsHtmlRedirect(req);

    if (!username || !password) {
      if (htmlRedirect) {
        return NextResponse.redirect(new URL("/login?error=missing", req.url));
      }
      return jsonError("Username and password required.");
    }

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user || !user.active) {
      if (htmlRedirect) {
        return NextResponse.redirect(new URL("/login?error=invalid", req.url));
      }
      return jsonError("Invalid username or password.");
    }
    if (!(await verifyPassword(password, user.passwordHash))) {
      if (htmlRedirect) {
        return NextResponse.redirect(new URL("/login?error=invalid", req.url));
      }
      return jsonError("Invalid username or password.");
    }

    after(() => upgradePasswordHashIfNeeded(user.id, password, user.passwordHash));

    if (user.role === "owner") {
      await establishUserLogin(user.id);
      if (htmlRedirect) {
        return NextResponse.redirect(new URL("/", req.url));
      }
      return jsonOk({ ok: true, role: "owner", redirect: "/" });
    }

    const reqRow = await createStaffLoginRequest(user.id);
    const session = await getSession();
    session.pendingLoginToken = reqRow.token;
    await session.save();
    const pendingUrl = new URL("/login/pending", req.url);
    pendingUrl.searchParams.set("t", reqRow.token);
    if (htmlRedirect) {
      return NextResponse.redirect(pendingUrl);
    }
    return jsonOk({ ok: true, role: "staff", pending: true, redirect: pendingUrl.pathname + pendingUrl.search });
  } catch (e) {
    console.error(e);
    return jsonError("Login failed.", 500);
  }
}
