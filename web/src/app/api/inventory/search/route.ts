import { NextRequest } from "next/server";
import { jsonOk, requireUser, isResponse } from "@/lib/api";
import { createPerfTimer, withServerTiming } from "@/lib/perfTiming";
import { memoryCachedQuery } from "@/lib/perfCache";
import { getShopRevision } from "@/lib/realtime/revision";
import {
  inventorySearchApiRow,
  searchInventoryText,
} from "@/lib/services/inventorySearch";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const perf = createPerfTimer("GET /api/inventory/search");
  perf.mark("auth");
  const user = await requireUser();
  perf.endStage("authMs", "auth");
  if (isResponse(user)) return user;

  perf.mark("parse");
  const q = req.nextUrl.searchParams.get("q")?.trim() || "";
  const category = req.nextUrl.searchParams.get("category")?.trim() || "";
  perf.endStage("parseMs", "parse");

  if (!q) {
    const timings = perf.finish({ kind: "read" });
    return withServerTiming(
      jsonOk({ category_results: [], other_results: [], used_fallback: false, category }),
      timings,
    );
  }

  perf.mark("query");
  const revision = await getShopRevision();
  const payload = await memoryCachedQuery(
    ["inventory-search", revision, q, category],
    async () => {
      let categoryResults = category
        ? await searchInventoryText({ q, category, limit: 20 })
        : [];
      let otherResults: typeof categoryResults = [];
      let usedFallback = false;

      if (category && !categoryResults.length) {
        otherResults = await searchInventoryText({ q, limit: 20 });
        usedFallback = otherResults.length > 0;
      } else if (!category) {
        categoryResults = await searchInventoryText({ q, limit: 20 });
      }

      return {
        category_results: categoryResults.map(inventorySearchApiRow),
        other_results: otherResults.map(inventorySearchApiRow),
        used_fallback: usedFallback,
        category,
      };
    },
    20,
  );
  perf.endStage("queryMs", "query");
  perf.setItemCount(
    payload.category_results.length + payload.other_results.length,
  );

  const timings = perf.finish({ kind: "read" });
  const res = withServerTiming(jsonOk(payload), timings);
  res.headers.set("Cache-Control", "private, max-age=15, stale-while-revalidate=30");
  return res;
}
