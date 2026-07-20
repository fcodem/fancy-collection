import { NextRequest } from "next/server";
import { dashboardSearchBookings } from "@/lib/services/dashboardSearch";
import { jsonOk, requireUserReadOnly, isResponse } from "@/lib/api";
import { todayIso } from "@/lib/constants";

import { memoryCachedQuery } from "@/lib/perfCache";
import { getFreshShopRevision } from "@/lib/realtime/revision";

export async function GET(req: NextRequest) {
  const user = await requireUserReadOnly();
  if (isResponse(user)) return user;

  const q = req.nextUrl.searchParams.get("q")?.trim() || "";
  const date = req.nextUrl.searchParams.get("date") || todayIso();

  const revision = await getFreshShopRevision();
  const { mode, results } = await memoryCachedQuery(
    ["dashboard-search", revision, q, date],
    () => dashboardSearchBookings(q, date),
    15,
  );
  const res = jsonOk({ mode, results });
  res.headers.set("Cache-Control", "private, max-age=10, stale-while-revalidate=20");
  return res;
}
