import { NextRequest } from "next/server";
import { jsonOk, requireUserReadOnly, isResponse } from "@/lib/api";
import { createPerfTimer, withServerTiming } from "@/lib/perfTiming";
import { memoryCachedQuery } from "@/lib/perfCache";
import { getShopRevision } from "@/lib/realtime/revision";
import { dressSuggestRow, searchInventoryText } from "@/lib/services/inventorySearch";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const perf = createPerfTimer("GET /api/dress-name/suggest");
  perf.mark("auth");
  const user = await requireUserReadOnly();
  perf.endStage("authMs", "auth");
  if (isResponse(user)) return user;

  perf.mark("parse");
  const q = req.nextUrl.searchParams.get("q")?.trim() || "";
  const category = req.nextUrl.searchParams.get("category")?.trim() || "";
  const itemType = req.nextUrl.searchParams.get("item_type")?.trim() || "";
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "12", 10), 48);
  perf.endStage("parseMs", "parse");

  if (!q) {
    const timings = perf.finish({ kind: "read" });
    return withServerTiming(jsonOk([]), timings);
  }

  perf.mark("query");
  const revision = await getShopRevision();
  const payload = await memoryCachedQuery(
    ["dress-name-suggest", revision, q, category, itemType, String(limit)],
    async () => {
      const items = await searchInventoryText({
        q,
        category,
        itemType,
        limit,
        distinctSizes: true,
      });
      return items.map(dressSuggestRow);
    },
    20,
  );
  perf.endStage("queryMs", "query");
  perf.addQueries(1);
  perf.setItemCount(payload.length);

  const timings = perf.finish({ kind: "read" });
  const res = withServerTiming(jsonOk(payload), timings);
  res.headers.set("Cache-Control", "private, max-age=15, stale-while-revalidate=30");
  return res;
}
