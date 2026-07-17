import { NextRequest } from "next/server";
import { jsonOk, requireUser, isResponse } from "@/lib/api";
import { createPerfTimer, withServerTiming } from "@/lib/perfTiming";
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
  let categoryResults = category
    ? await searchInventoryText({ q, category, limit: 20 })
    : [];
  let otherResults: typeof categoryResults = [];
  let usedFallback = false;

  if (category && !categoryResults.length) {
    otherResults = await searchInventoryText({ q, limit: 20 });
    usedFallback = otherResults.length > 0;
    perf.addQueries(2);
  } else if (!category) {
    categoryResults = await searchInventoryText({ q, limit: 20 });
    perf.addQueries(1);
  } else {
    perf.addQueries(1);
  }
  perf.endStage("queryMs", "query");
  perf.setItemCount(categoryResults.length + otherResults.length);

  perf.mark("serialize");
  const payload = {
    category_results: categoryResults.map(inventorySearchApiRow),
    other_results: otherResults.map(inventorySearchApiRow),
    used_fallback: usedFallback,
    category,
  };
  perf.endStage("serializeMs", "serialize");

  const timings = perf.finish({ kind: "read" });
  return withServerTiming(jsonOk(payload), timings);
}
