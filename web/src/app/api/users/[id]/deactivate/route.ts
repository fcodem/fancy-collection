import { toggleUserActive } from "@/lib/services/adminOps";
import { jsonError, jsonOk, requireOwner, isResponse } from "@/lib/api";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireOwner();
  if (isResponse(user)) return user;
  const { id } = await params;
  try {
    const updated = await toggleUserActive(parseInt(id, 10), user.id);
    return jsonOk({ ok: true, active: updated.active });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed");
  }
}
