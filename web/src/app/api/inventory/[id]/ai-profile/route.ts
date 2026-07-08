import { NextRequest } from "next/server";
import { fetchAiProfile } from "@/lib/inventoryAiProfile/service";
import { jsonError, jsonOk, requireOwner, isResponse } from "@/lib/api";

/** Customer-safe AI profile metadata — no embeddings exposed. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireOwner();
  if (isResponse(user)) return user;
  const { id } = await params;
  const itemId = parseInt(id, 10);
  if (!Number.isFinite(itemId)) return jsonError("Invalid item id", 400);

  const profile = await fetchAiProfile(itemId, false);
  if (!profile) return jsonError("Item not found", 404);

  return jsonOk({ ok: true, profile });
}
