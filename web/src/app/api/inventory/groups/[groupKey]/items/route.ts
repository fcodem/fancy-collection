import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireUserReadOnly, isResponse } from "@/lib/api";
import { createPerfTimer, withServerTiming } from "@/lib/perfTiming";
import { listInventoryGroupItems } from "@/lib/services/inventoryList";
import { photoUrl } from "@/lib/photoUrl";
import { dressDisplayName } from "@/lib/dress";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ groupKey: string }> },
) {
  const perf = createPerfTimer("GET /api/inventory/groups/[groupKey]/items");
  perf.mark("auth");
  const user = await requireUserReadOnly();
  perf.endStage("authMs", "auth");
  if (isResponse(user)) return user;

  const { groupKey: raw } = await ctx.params;
  const groupKey = decodeURIComponent(raw || "").trim();
  if (!groupKey) return jsonError("groupKey required", 400);

  perf.mark("query");
  const items = await listInventoryGroupItems(groupKey);
  perf.endStage("queryMs", "query");
  perf.setItemCount(items.length);

  const timings = perf.finish({ kind: "read" });
  return withServerTiming(
    jsonOk({
      groupKey,
      items: items.map((i) => ({
        id: i.id,
        sku: i.sku,
        name: i.name,
        displayName: dressDisplayName(i.name, i.category, i.size),
        category: i.category,
        size: i.size,
        color: i.color,
        status: i.status,
        dailyRate: i.dailyRate,
        thumbnailUrl: i.thumbnailPhoto
          ? photoUrl(i.thumbnailPhoto)
          : i.photo
            ? photoUrl(i.photo)
            : null,
      })),
    }),
    timings,
  );
}
