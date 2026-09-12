import { NextRequest } from "next/server";
import { dashboardSearchBookings } from "@/lib/services/dashboardSearch";
import { jsonOk, requireUserReadOnly, isResponse } from "@/lib/api";
import { todayIso } from "@/lib/constants";

import { memoryCachedQuery } from "@/lib/perfCache";
import { getShopRevision } from "@/lib/realtime/revision";

export async function GET(req: NextRequest) {
  const user = await requireUserReadOnly();
  if (isResponse(user)) return user;

  const q = req.nextUrl.searchParams.get("q")?.trim() || "";
  const date = req.nextUrl.searchParams.get("date") || todayIso();

  // Cached revision is enough for quick search (5s) — avoids an extra DB round-trip per keystroke.
  const revision = await getShopRevision();
  const { mode, results } = await memoryCachedQuery(
    ["dashboard-search", revision, q, date],
    () => dashboardSearchBookings(q, date),
    20,
  );
  const res = jsonOk({ mode, results });
  res.headers.set("Cache-Control", "private, max-age=15, stale-while-revalidate=30");
  return res;
}
