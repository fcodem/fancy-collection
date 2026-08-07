import { deleteUserAccount } from "@/lib/services/adminOps";
import { jsonError, jsonOk, requireOwner, isResponse } from "@/lib/api";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireOwner();
  if (isResponse(user)) return user;
  const { id } = await params;
  try {
    const result = await deleteUserAccount(parseInt(id, 10), user.id);
    return jsonOk({ deleted: true, username: result.username });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed");
  }
}

/** POST also deletes (some clients prefer POST for destructive actions). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return DELETE(req, ctx);
}
