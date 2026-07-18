import { NextRequest } from "next/server";
import { savePackingItem } from "@/lib/services/operations";
import { jsonError, jsonOk, requireUser, isResponse, requireJsonContentType } from "@/lib/api";

async function save(req: NextRequest) {
  const _ct = requireJsonContentType(req);
  if (_ct) return _ct;

  const user = await requireUser();
  if (isResponse(user)) return user;
  try {
    const body = await req.json();
    if (!body.bi_id) return jsonError("Missing bi_id", 400);
    const result = await savePackingItem(body, user.username);
    return jsonOk(result);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Save failed", 404);
  }
}

export const POST = save;
export const PATCH = save;
