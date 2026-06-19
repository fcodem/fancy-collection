import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { getSession, establishUserLogin, expireOldLoginRequests } from "@/lib/auth";
import { jsonOk } from "@/lib/api";

async function resolveLoginRequestToken(req: NextRequest) {
  const session = await getSession();
  const queryToken = req.nextUrl.searchParams.get("t")?.trim() || "";
  return queryToken || session.pendingLoginToken || "";
}

export async function GET(req: NextRequest) {
  const token = await resolveLoginRequestToken(req);
  if (!token) return jsonOk({ status: "none" });

  await expireOldLoginRequests();
  const reqRow = await prisma.staffLoginRequest.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!reqRow) return jsonOk({ status: "none" });

  if (reqRow.status === "approved") {
    const session = await getSession();
    let active = false;
    if (session.userId === reqRow.userId && session.sessionId) {
      const row = await prisma.userSession.findFirst({
        where: { userId: reqRow.userId, sessionId: session.sessionId, active: true },
      });
      active = !!row;
    }
    if (!active) {
      await establishUserLogin(reqRow.userId);
    }
    return jsonOk({ status: "approved", redirect: "/" });
  }
  if (reqRow.status === "rejected") return jsonOk({ status: "rejected" });
  if (reqRow.status === "expired") return jsonOk({ status: "expired" });
  return jsonOk({ status: "pending" });
}
