import { NextRequest } from "next/server";
import { updateJewellerySelectionPhoto } from "@/lib/services/jewelleryOps";
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
    const result = await updateJewellerySelectionPhoto(
      bookingId,
      selectionId,
      body.photo ?? null,
      user.username,
    );
    return jsonOk({ ok: true, photo: result.photo });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed");
  }
}
