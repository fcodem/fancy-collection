import { NextRequest } from "next/server";
import { hideCategory } from "@/lib/services/adminOps";
import { jsonError, jsonOk, requireOwner, isResponse, requireJsonContentType } from "@/lib/api";

export async function POST(req: NextRequest) {
  const _ct = requireJsonContentType(req);
  if (_ct) return _ct;

  const user = await requireOwner();
  if (isResponse(user)) return user;
  try {
    const body = await req.json();
    await hideCategory(body.name);
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed");
  }
}
