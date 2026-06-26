import { NextRequest } from "next/server";
import { updateCustomCategory, removeCustomCategory } from "@/lib/services/adminOps";
import { jsonError, jsonOk, requireOwner, isResponse } from "@/lib/api";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireOwner();
  if (isResponse(user)) return user;
  const { id } = await params;
  try {
    const body = await req.json();
    const cat = await updateCustomCategory(parseInt(id, 10), body.name, body.group || "other");
    return jsonOk({ ok: true, id: cat.id });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed");
  }
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireOwner();
  if (isResponse(user)) return user;
  const { id } = await params;
  try {
    await removeCustomCategory(parseInt(id, 10));
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed");
  }
}
