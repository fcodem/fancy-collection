"use server";

import * as Sentry from "@sentry/nextjs";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  createStaffLoginRequest,
  establishUserLogin,
  findRecentApprovedStaffLogin,
  findUserForLogin,
  getSession,
  upgradePasswordHashIfNeeded,
  verifyPassword,
} from "@/lib/auth";
import prisma from "@/lib/prisma";
import {
  checkLoginBlocked,
  getClientIp,
  loginBlockedMessage,
  recordLoginAttempt,
} from "@/lib/loginRateLimit";

async function loginActionImpl(
  _prevState: string | undefined,
  formData: FormData,
): Promise<string | undefined> {
  const ip = await getClientIp();
  const blocked = await checkLoginBlocked(ip);
  if (blocked.blocked) {
    return loginBlockedMessage(blocked.retryAfterMinutes ?? 60);
  }

  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "");

  if (!username || !password) {
    return "Username and password are required.";
  }

  try {
    const user = await findUserForLogin(username);
    if (!user || !user.active) {
      await recordLoginAttempt(ip, false, username);
      return "Invalid username or password.";
    }
    if (!(await verifyPassword(password, user.passwordHash))) {
      await recordLoginAttempt(ip, false, username);
      return "Invalid username or password.";
    }

    await recordLoginAttempt(ip, true, username);
    void upgradePasswordHashIfNeeded(user.id, password, user.passwordHash);

    if (user.role === "owner") {
      await establishUserLogin(user.id);
      redirect("/");
    }

    const approved = await findRecentApprovedStaffLogin(user.id);
    if (approved) {
      await prisma.staffLoginRequest.update({
        where: { id: approved.id },
        data: { status: "completed" },
      });
      await establishUserLogin(user.id);
      redirect("/");
    }

    const reqRow = await createStaffLoginRequest(user.id);
    const session = await getSession();
    session.pendingLoginToken = reqRow.token;
    await session.save();
    redirect(`/login/pending?t=${encodeURIComponent(reqRow.token)}`);
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: string }).digest).startsWith("NEXT_REDIRECT")) {
      throw e;
    }
    console.error("loginAction failed:", e);
    throw e;
  }
}

export async function loginAction(
  prevState: string | undefined,
  formData: FormData,
): Promise<string | undefined> {
  try {
    return await Sentry.withServerActionInstrumentation(
      "loginAction",
      { headers: await headers(), formData, recordResponse: true },
      () => loginActionImpl(prevState, formData),
    );
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: string }).digest).startsWith("NEXT_REDIRECT")) {
      throw e;
    }
    return "Login failed. Please check the database connection and try again.";
  }
}
