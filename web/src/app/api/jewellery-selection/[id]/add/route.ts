import { NextRequest } from "next/server";
import { addJewellerySelection } from "@/lib/services/jewelleryOps";
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
    const entry = await addJewellerySelection(
      bookingId,
      {
        name: body.name,
        photo: body.photo,
        itemId: body.item_id ? parseInt(String(body.item_id), 10) : null,
        category: body.category,
        note: body.note,
        pickNecklace: body.pick_necklace === true || body.pick_necklace === "1",
        pickEarrings: body.pick_earrings === true || body.pick_earrings === "1",
        pickTeeka: body.pick_teeka === true || body.pick_teeka === "1",
        pickPasa: body.pick_pasa === true || body.pick_pasa === "1",
      },
      user.username,
    );
    return jsonOk({ ok: true, id: entry.id });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed");
  }
}
