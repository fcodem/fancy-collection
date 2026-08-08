import { NextRequest, after } from "next/server";
import prisma from "@/lib/prisma";
import { jsonError, jsonOk, requireOwner, requireUser, isResponse } from "@/lib/api";
import { listMensProductSizes } from "@/lib/services/inventoryList";
import {
  addMensProductSize,
  deleteMensProduct,
  removeMensProductSize,
} from "@/lib/services/inventoryOps";
import { generateDefaultScanCodesInTx } from "@/lib/services/inventoryScanCode";
import { invalidateInventoryListCaches } from "@/lib/inventoryCacheTags";
import { SIZES } from "@/lib/constants";

export const dynamic = "force-dynamic";

/** List sizes for a men's product (seed = any unit id of that product). */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (isResponse(user)) return user;

  const { id: rawId } = await ctx.params;
  const seedId = Number(rawId);
  if (!Number.isFinite(seedId)) return jsonError("Invalid id", 400);

  const seed = await prisma.clothingItem.findUnique({
    where: { id: seedId },
    select: { id: true, name: true, category: true },
  });
  if (!seed) return jsonError("Not found", 404);

  const sizes = await listMensProductSizes(seed.name, seed.category);
  const present = new Set(sizes.map((s) => s.size.toLowerCase()));
  const availableToAdd = SIZES.filter((s) => !present.has(s.toLowerCase()));

  return jsonOk({
    seedId: seed.id,
    name: seed.name.replace(/\s+#\d+$/, "").trim(),
    category: seed.category,
    sizes,
    availableToAdd,
  });
}

/** Add/remove size or delete whole product. Body: { action, size?, quantity? } */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  const { id: rawId } = await ctx.params;
  const seedId = Number(rawId);
  if (!Number.isFinite(seedId)) return jsonError("Invalid id", 400);

  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    size?: string;
    quantity?: number;
  };
  const action = String(body.action || "").trim().toLowerCase();
  const size = String(body.size || "").trim();

  try {
    if (action === "delete-product") {
      const result = await deleteMensProduct({
        seedItemId: seedId,
        by: user.username,
      });
      invalidateInventoryListCaches();
      return jsonOk({
        ok: true,
        action: "delete-product",
        deletedIds: result.deletedIds,
        name: result.name,
      });
    }

    if (!size) return jsonError("Size is required.", 400);

    if (action === "add") {
      const result = await addMensProductSize({
        seedItemId: seedId,
        size,
        quantity: body.quantity,
        by: user.username,
      });
      const canonicalId = Math.min(...result.items.map((i) => i.id));
      after(async () => {
        await prisma
          .$transaction((tx) => generateDefaultScanCodesInTx(tx, canonicalId))
          .catch((e) => console.error("[mens-sizes] scan code gen failed:", e));
        invalidateInventoryListCaches();
      });
      return jsonOk({
        ok: true,
        action: "add",
        size: result.size,
        ids: result.items.map((i) => i.id),
        inventory_group_id: result.inventoryGroupId,
      });
    }

    if (action === "remove") {
      const result = await removeMensProductSize({
        seedItemId: seedId,
        size,
        by: user.username,
      });
      invalidateInventoryListCaches();
      return jsonOk({
        ok: true,
        action: "remove",
        size: result.size,
        deletedIds: result.deletedIds,
      });
    }

    return jsonError('action must be "add", "remove", or "delete-product".', 400);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Size update failed.", 400);
  }
}
