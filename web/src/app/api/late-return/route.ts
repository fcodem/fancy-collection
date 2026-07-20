import { NextRequest } from "next/server";
import { jsonOk, requireUserReadOnly, isResponse } from "@/lib/api";
import { loadLateReturnPageCached } from "@/lib/services/lateReturnData";
import { createMenuPerfTimer } from "@/lib/menuPerf";

export async function GET(req: NextRequest) {
  const perf = createMenuPerfTimer("/api/late-return");
  const user = await requireUserReadOnly();
  if (isResponse(user)) return user;

  const page = parseInt(req.nextUrl.searchParams.get("page") || "1", 10);
  const data = await loadLateReturnPageCached({ page: Number.isFinite(page) ? page : 1 });
  perf.finish({ kind: "read" });
  const res = jsonOk(data);
  res.headers.set("Cache-Control", "private, max-age=15, stale-while-revalidate=30");
  return res;
}
