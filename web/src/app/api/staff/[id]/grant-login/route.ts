import { NextRequest } from "next/server";
import { randomBytes } from "crypto";
import prisma from "@/lib/prisma";
import { jsonError, jsonOk, requireOwner, isResponse, requireJsonContentType } from "@/lib/api";

/** Owner grants a short login window so staff can sign in without waiting on pending UI. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const _ct = requireJsonContentType(req);
  if (_ct) return _ct;

  const owner = await requireOwner();
  if (isResponse(owner)) return owner;

  const { id } = await params;
  const staffId = Number(id);
  if (!Number.isFinite(staffId) || staffId <= 0) return jsonError("Invalid staff id", 400);

  const user = await prisma.user.findFirst({
    where: { staffId, active: true, role: "staff" },
  });
  if (!user) return jsonError("No active staff login linked to this person.", 404);

  await prisma.staffLoginRequest.create({
    data: {
      userId: user.id,
      token: randomBytes(24).toString("base64url"),
      status: "approved",
      resolvedAt: new Date(),
      resolvedById: owner.id,
    },
  });

  return jsonOk({
    ok: true,
    username: user.username,
    message: `${user.username} can sign in now (within 30 minutes).`,
  });
}
