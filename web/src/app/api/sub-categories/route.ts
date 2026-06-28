import { NextRequest } from "next/server";
import { listSubCategories, addSubCategory } from "@/lib/services/adminOps";
import { jsonError, jsonOk, requireOwner, requireUser, isResponse, requireJsonContentType } from "@/lib/api";

export async function GET() {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const sub_categories = await listSubCategories();
  return jsonOk({ sub_categories });
}

export async function POST(req: NextRequest) {
  const _ct = requireJsonContentType(req);
  if (_ct) return _ct;

  const user = await requireOwner();
  if (isResponse(user)) return user;
  try {
    const body = await req.json();
    const row = await addSubCategory(body.name);
    return jsonOk({ ok: true, id: row.id });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed");
  }
}
