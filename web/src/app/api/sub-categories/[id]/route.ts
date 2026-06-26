import { NextRequest } from "next/server";
import { updateSubCategory, removeSubCategory } from "@/lib/services/adminOps";
import { jsonError, jsonOk, requireOwner, isResponse } from "@/lib/api";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireOwner();
  if (isResponse(user)) return user;
  const { id } = await params;
  try {
    const body = await req.json();
    const row = await updateSubCategory(parseInt(id, 10), body.name);
    return jsonOk({ ok: true, id: row.id });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed");
  }
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireOwner();
  if (isResponse(user)) return user;
  const { id } = await params;
  try {
    await removeSubCategory(parseInt(id, 10));
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed");
  }
}
