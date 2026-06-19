import { NextRequest } from "next/server";
import { changeOwnPassword } from "@/lib/services/adminOps";
import { jsonError, jsonOk, requireUser, isResponse } from "@/lib/api";

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  try {
    const body = await req.json();
    await changeOwnPassword(user.id, body.current_password, body.new_password);
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed");
  }
}
