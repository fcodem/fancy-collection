import { NextRequest } from "next/server";
import {
  listCustomCategories,
  addCustomCategory,
  getManagedCategoryGroups,
} from "@/lib/services/adminOps";
import { jsonError, jsonOk, requireOwner, requireUser, isResponse, requireJsonContentType } from "@/lib/api";

export async function GET() {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const [groups, custom_cats] = await Promise.all([
    getManagedCategoryGroups(),
    listCustomCategories(),
  ]);
  return jsonOk({ groups, custom_cats });
}

export async function POST(req: NextRequest) {
  const _ct = requireJsonContentType(req);
  if (_ct) return _ct;

  const user = await requireOwner();
  if (isResponse(user)) return user;
  try {
    const body = await req.json();
    const cat = await addCustomCategory(body.name, body.group || "other");
    return jsonOk({ ok: true, id: cat.id });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed");
  }
}
