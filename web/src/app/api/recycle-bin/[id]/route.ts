import { deleteBookingPermanent } from "@/lib/services/operations";
import { jsonError, jsonOk, requireOwner, isResponse } from "@/lib/api";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireOwner();
  if (isResponse(user)) return user;
  const { id } = await params;
  try {
    await deleteBookingPermanent(parseInt(id, 10));
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed");
  }
}
