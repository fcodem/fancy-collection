import { getBookingRestoreCheck } from "@/lib/services/operations";
import { jsonError, jsonOk, requireOwner, isResponse } from "@/lib/api";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireOwner();
  if (isResponse(user)) return user;
  const { id } = await params;
  try {
    const check = await getBookingRestoreCheck(parseInt(id, 10));
    return jsonOk(check);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Check failed", 400);
  }
}
