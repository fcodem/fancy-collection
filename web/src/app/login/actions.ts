"use server";

import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import {
  createStaffLoginRequest,
  establishUserLogin,
  getSession,
  upgradePasswordHashIfNeeded,
  verifyPassword,
} from "@/lib/auth";

export async function loginAction(
  _prevState: string | undefined,
  formData: FormData,
): Promise<string | undefined> {
  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "");

  if (!username || !password) {
    return "Username and password are required.";
  }

  try {
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user || !user.active) {
      return "Invalid username or password.";
    }
    if (!(await verifyPassword(password, user.passwordHash))) {
      return "Invalid username or password.";
    }

    void upgradePasswordHashIfNeeded(user.id, password, user.passwordHash);

    if (user.role === "owner") {
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
    return "Login failed. Please check the database connection and try again.";
  }
}
