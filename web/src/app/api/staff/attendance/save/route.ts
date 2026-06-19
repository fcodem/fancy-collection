import { NextRequest } from "next/server";
import { saveAttendance, markShopClosed } from "@/lib/services/staffOps";
import { jsonError, jsonOk, requireOwner, requireUser, isResponse } from "@/lib/api";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.shop_closed) {
      const user = await requireOwner();
      if (isResponse(user)) return user;
      await markShopClosed(body.date);
    } else {
      const user = await requireUser();
      if (isResponse(user)) return user;
      await saveAttendance(body.date, body.statuses || {});
    }
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed");
  }
}
