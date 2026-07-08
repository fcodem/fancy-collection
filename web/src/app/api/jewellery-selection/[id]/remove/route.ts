import { NextRequest } from "next/server";
import { removeJewellerySelection } from "@/lib/services/jewelleryOps";
import { jsonError, jsonOk, requireUser, isResponse, requireJsonContentType } from "@/lib/api";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const _ct = requireJsonContentType(req);
  if (_ct) return _ct;

  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id } = await params;
  const bookingId = parseInt(id, 10);
  if (!bookingId) return jsonError("Invalid booking");

  try {
    const body = await req.json();
    const selectionId = parseInt(String(body.selection_id), 10);
    if (!selectionId) return jsonError("Invalid selection");
    await removeJewellerySelection(bookingId, selectionId, user.username);
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed");
  }
}
