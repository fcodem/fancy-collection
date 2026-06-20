import { NextRequest } from "next/server";
import { savePackingItem } from "@/lib/services/operations";
import { jsonError, jsonOk, requireUser, isResponse } from "@/lib/api";

export async function POST(req: NextRequest) {
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
