import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  expireOldLoginRequests,
  establishUserLogin,
  getCurrentUser,
  PENDING_LOGIN_COOKIE,
} from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(PENDING_LOGIN_COOKIE)?.value;
  if (!token) return NextResponse.json({ status: "none" }, { status: 404 });

  await expireOldLoginRequests();
  const req = await prisma.staffLoginRequest.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!req) {
    cookieStore.delete(PENDING_LOGIN_COOKIE);
    return NextResponse.json({ status: "none" });
  }
  if (req.status === "approved") {
    const sessionId = await establishUserLogin(req.userId);
    cookieStore.set("rental_session_id", sessionId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    cookieStore.delete(PENDING_LOGIN_COOKIE);
    return NextResponse.json({ status: "approved", redirect: "/" });
  }
  if (req.status === "rejected") {
    cookieStore.delete(PENDING_LOGIN_COOKIE);
    return NextResponse.json({ status: "rejected", message: "Owner denied your login request." });
  }
  if (req.status === "expired") {
    cookieStore.delete(PENDING_LOGIN_COOKIE);
    return NextResponse.json({ status: "expired", message: "Request expired. Please try again." });
  }
  return NextResponse.json({
    status: "pending",
    username: req.user.username,
    requested_at: req.requestedAt.toISOString(),
  });
}
