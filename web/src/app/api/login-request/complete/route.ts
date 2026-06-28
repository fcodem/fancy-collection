import { NextRequest, NextResponse } from "next/server";
import { completeStaffLoginByToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Full-page redirect after owner approval — reliably sets session cookie on the response. */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("t")?.trim() || "";
  const loginUrl = new URL("/login", req.url);

  if (!token) {
    loginUrl.searchParams.set("error", "pending");
    return NextResponse.redirect(loginUrl);
  }

  const response = await completeStaffLoginByToken(token, req);
  if (response) return response;

  const pendingUrl = new URL("/login/pending", req.url);
  pendingUrl.searchParams.set("t", token);
  return NextResponse.redirect(pendingUrl);
}
