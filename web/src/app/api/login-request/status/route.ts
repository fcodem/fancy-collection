import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession, expireOldLoginRequests } from "@/lib/auth";
import { jsonOk } from "@/lib/api";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, no-cache, must-revalidate" };

async function resolveLoginRequestToken(req: NextRequest) {
  const session = await getSession();
  const queryToken = req.nextUrl.searchParams.get("t")?.trim() || "";
  return queryToken || session.pendingLoginToken || "";
}

export async function GET(req: NextRequest) {
  const token = await resolveLoginRequestToken(req);
  if (!token) {
    return NextResponse.json({ status: "none" }, { headers: NO_STORE });
  }

  await expireOldLoginRequests();
  const reqRow = await prisma.staffLoginRequest.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!reqRow) {
    return NextResponse.json({ status: "none" }, { headers: NO_STORE });
  }

  if (reqRow.status === "approved") {
    return NextResponse.json(
      {
        status: "approved",
        redirect: `/api/login-request/complete?t=${encodeURIComponent(token)}`,
      },
      { headers: NO_STORE },
    );
  }
  if (reqRow.status === "rejected") {
    return NextResponse.json({ status: "rejected" }, { headers: NO_STORE });
  }
  if (reqRow.status === "expired") {
    return NextResponse.json({ status: "expired" }, { headers: NO_STORE });
  }
  return NextResponse.json({ status: "pending" }, { headers: NO_STORE });
}
