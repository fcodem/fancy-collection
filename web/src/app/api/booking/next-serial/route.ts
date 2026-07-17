import { NextRequest } from "next/server";
import { getNextSerialForDate } from "@/lib/services/bookingCrud";
import { jsonOk, requireUserReadOnly, isResponse } from "@/lib/api";
import { createPerfTimer, withServerTiming } from "@/lib/perfTiming";

export async function GET(req: NextRequest) {
  const perf = createPerfTimer("GET /api/booking/next-serial");
  perf.mark("auth");
  const user = await requireUserReadOnly();
  perf.endStage("authMs", "auth");
  if (isResponse(user)) return user;

  const sp = req.nextUrl.searchParams;
  const date =
    sp.get("delivery_date") ||
    sp.get("date") ||
    new Date().toISOString().slice(0, 10);
  perf.mark("db");
  const data = await getNextSerialForDate(date);
  perf.endStage("initialReadMs", "db");
  const timings = perf.finish({ kind: "read" });
  return withServerTiming(jsonOk(data), timings);
}
