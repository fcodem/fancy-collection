import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireOwner, isResponse } from "@/lib/api";
import { addInventoryUnits } from "@/lib/services/inventoryOps";
import { invalidateInventoryListCaches } from "@/lib/inventoryCacheTags";

export const dynamic = "force-dynamic";

/** Add more units to an existing (non-men's) item group. Body: { quantity } */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  const { id: rawId } = await ctx.params;
  const seedId = Number(rawId);
  if (!Number.isFinite(seedId)) return jsonError("Invalid id", 400);

  const body = (await req.json().catch(() => ({}))) as { quantity?: number };

  try {
    const result = await addInventoryUnits({
      seedItemId: seedId,
      quantity: body.quantity,
      by: user.username,
    });
    invalidateInventoryListCaches();
    return jsonOk({
      ok: true,
      added_ids: result.addedIds,
      inventory_group_id: result.inventoryGroupId,
      total_quantity: result.totalQuantity,
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Could not add units.", 400);
  }
}
