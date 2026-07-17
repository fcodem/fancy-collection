import { NextRequest } from "next/server";
import { jsonOk, requireUserReadOnly, isResponse } from "@/lib/api";
import { createPerfTimer, withServerTiming } from "@/lib/perfTiming";
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
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "12", 10), 20);
  perf.endStage("parseMs", "parse");

  if (!q) {
    const timings = perf.finish({ kind: "read" });
    return withServerTiming(jsonOk([]), timings);
  }

  perf.mark("query");
  const items = await searchInventoryText({ q, category, itemType, limit });
  perf.endStage("queryMs", "query");
  perf.addQueries(1);
  perf.setItemCount(items.length);

  perf.mark("serialize");
  const payload = items.map(dressSuggestRow);
  perf.endStage("serializeMs", "serialize");

  const timings = perf.finish({ kind: "read" });
  return withServerTiming(jsonOk(payload), timings);
}
