import { NextRequest } from "next/server";
import { changeOwnPassword } from "@/lib/services/adminOps";
import { jsonError, jsonOk, requireUser, isResponse, requireJsonContentType } from "@/lib/api";
import { enforceRateLimit } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  const _ct = requireJsonContentType(req);
  if (_ct) return _ct;

  const user = await requireUser();
  if (isResponse(user)) return user;
  const rate = enforceRateLimit(`change-password:${user.id}`, 5, 15 * 60_000);
  if (!rate.allowed) return jsonError("Too many password change attempts. Try again later.", 429);
  try {
    const body = await req.json();
    await changeOwnPassword(user.id, body.current_password, body.new_password);
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed");
  }
}
