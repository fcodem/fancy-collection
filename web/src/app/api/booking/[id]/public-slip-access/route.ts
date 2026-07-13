import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireOwner, isResponse, requireJsonContentType } from "@/lib/api";
import {
  ensurePublicSlipAccess,
  revokePublicSlipAccess,
} from "@/lib/services/whatsapp/publicSlipAccess";
import { enforceRateLimit } from "@/lib/rateLimit";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const user = await requireOwner();
  if (isResponse(user)) return user;
  const rate = enforceRateLimit(`slip-revoke:${user.id}`, 30, 60_000);
  if (!rate.allowed) return jsonError("Too many requests", 429);

  const { id } = await ctx.params;
  const bookingId = parseInt(id, 10);
  if (!Number.isFinite(bookingId)) return jsonError("Invalid booking", 400);
  await revokePublicSlipAccess(bookingId);
  return jsonOk({ ok: true, revoked: true });
}

/** Owner can mint/renew a random public slip token (never BK-######). */
export async function POST(req: NextRequest, ctx: Ctx) {
  const _ct = requireJsonContentType(req);
  if (_ct) return _ct;
  const user = await requireOwner();
  if (isResponse(user)) return user;
  const rate = enforceRateLimit(`slip-token:${user.id}`, 30, 60_000);
  if (!rate.allowed) return jsonError("Too many requests", 429);

  const { id } = await ctx.params;
  const bookingId = parseInt(id, 10);
  if (!Number.isFinite(bookingId)) return jsonError("Invalid booking", 400);
  const access = await ensurePublicSlipAccess(bookingId, { renewIfExpired: true });
  return jsonOk({
    ok: true,
    token: access.token,
    expiresAt: access.expiresAt.toISOString(),
  });
}
