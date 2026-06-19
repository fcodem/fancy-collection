import { NextRequest } from "next/server";
import { resetUserPassword } from "@/lib/services/adminOps";
import { jsonError, jsonOk, requireOwner, isResponse } from "@/lib/api";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireOwner();
  if (isResponse(user)) return user;
  const { id } = await params;
  try {
    const body = await req.json();
    await resetUserPassword(parseInt(id, 10), body.password);
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed");
  }
}
