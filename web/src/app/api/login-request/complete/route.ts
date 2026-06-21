import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { establishUserLogin, expireOldLoginRequests } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Full-page redirect after owner approval — reliably sets session cookie (fetch + redirect race). */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("t")?.trim() || "";
  const loginUrl = new URL("/login", req.url);

  if (!token) {
    loginUrl.searchParams.set("error", "pending");
    return NextResponse.redirect(loginUrl);
  }

  await expireOldLoginRequests();
  const reqRow = await prisma.staffLoginRequest.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!reqRow || reqRow.status !== "approved") {
    const pendingUrl = new URL("/login/pending", req.url);
    pendingUrl.searchParams.set("t", token);
    return NextResponse.redirect(pendingUrl);
  }

  if (!reqRow.user.active) {
    loginUrl.searchParams.set("error", "invalid");
    return NextResponse.redirect(loginUrl);
  }

  await establishUserLogin(reqRow.userId);
  return NextResponse.redirect(new URL("/", req.url));
}
