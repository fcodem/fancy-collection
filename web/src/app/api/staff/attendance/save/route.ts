import { NextRequest } from "next/server";
import { saveAttendance, markShopClosed } from "@/lib/services/staffOps";
import { jsonError, jsonOk, requireOwner, isResponse, requireJsonContentType } from "@/lib/api";

export async function POST(req: NextRequest) {
  const _ct = requireJsonContentType(req);
  if (_ct) return _ct;

  try {
    const body = await req.json();
    if (body.shop_closed) {
      const user = await requireOwner();
      if (isResponse(user)) return user;
      await markShopClosed(body.date, user.username);
    } else {
      const user = await requireOwner();
      if (isResponse(user)) return user;
      await saveAttendance(body.date, body.statuses || {}, user.username);
    }
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed");
  }
}
