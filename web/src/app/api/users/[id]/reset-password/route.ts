import { NextRequest } from "next/server";
import { resetUserPassword } from "@/lib/services/adminOps";
import { jsonError, jsonOk, requireOwner, isResponse, requireJsonContentType } from "@/lib/api";
import { enforceRateLimit } from "@/lib/rateLimit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const _ct = requireJsonContentType(req);
  if (_ct) return _ct;

  const user = await requireOwner();
  if (isResponse(user)) return user;
  const rate = enforceRateLimit(`reset-password:${user.id}`, 10, 15 * 60_000);
  if (!rate.allowed) return jsonError("Too many password resets. Try again later.", 429);
  const { id } = await params;
  try {
    const body = await req.json();
    await resetUserPassword(parseInt(id, 10), body.password, user.id);
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed");
  }
}
