import { NextRequest } from "next/server";
import { jsonOk, requireFastReadUser, isResponse } from "@/lib/api";
import { createPerfTimer, withServerTiming } from "@/lib/perfTiming";
import { searchDeliveryOrReturn } from "@/lib/services/deliveryReturnSearch";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const perf = createPerfTimer("GET /api/return/search");
  const user = await requireFastReadUser(perf);
  if (isResponse(user)) return user;

  perf.mark("parse");
  const sp = req.nextUrl.searchParams;
  const date = sp.get("date");
  const q = sp.get("q");
  const category = sp.get("category");
  const cursor = sp.get("cursor");
  const limit = sp.get("limit");
  const page = sp.get("page");
  const pageSize = sp.get("pageSize") || sp.get("limit");
  perf.endStage("parseMs", "parse");

  perf.mark("query");
  const data = await searchDeliveryOrReturn({
    mode: "return",
    date,
    q,
    category,
    cursor,
    limit,
    page,
    pageSize,
  });
  perf.endStage("queryMs", "query");
  perf.setRowCount(data.results.length);

  const timings = perf.finish({ kind: "read" });
  return withServerTiming(jsonOk(data), timings);
}
