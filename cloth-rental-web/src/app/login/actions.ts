"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  authenticateUser,
  createStaffLoginRequest,
  establishUserLogin,
  PENDING_LOGIN_COOKIE,
  SESSION_COOKIE,
} from "@/lib/auth";

export async function loginAction(formData: FormData) {
  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "");
  const user = await authenticateUser(username, password);
  if (!user) redirect("/login?error=1");

  const cookieStore = await cookies();
  if (user.role === "owner") {
    const sessionId = await establishUserLogin(user.id);
    cookieStore.set(SESSION_COOKIE, sessionId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    redirect("/");
  }

  const req = await createStaffLoginRequest(user.id);
  cookieStore.set(PENDING_LOGIN_COOKIE, req.token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 30,
  });
  redirect("/login/pending");
}
