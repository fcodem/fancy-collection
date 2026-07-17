import { NextRequest } from "next/server";
import { bookingDateCheck } from "@/lib/services/operations";
import { jsonError, jsonOk, requireUser, isResponse } from "@/lib/api";
import { createPerfTimer, withServerTiming } from "@/lib/perfTiming";

export async function GET(req: NextRequest) {
  const perf = createPerfTimer("GET /api/booking/date-check");
  perf.mark("auth");
  const user = await requireUser();
  perf.endStage("authMs", "auth");
  if (isResponse(user)) return user;
  try {
    const bookingId = parseInt(req.nextUrl.searchParams.get("booking_id") || "0", 10);
    const deliveryDate = req.nextUrl.searchParams.get("delivery_date") || "";
    const returnDate = req.nextUrl.searchParams.get("return_date") || "";
    const itemIds = req.nextUrl.searchParams.getAll("item_ids[]").map((x) => parseInt(x, 10)).filter(Boolean);
    perf.setItemCount(itemIds.length);
    perf.mark("db");
    const results = await bookingDateCheck(bookingId, deliveryDate, returnDate, itemIds);
    perf.endStage("conflictCheckMs", "db");
    const timings = perf.finish({ kind: "read" });
    return withServerTiming(jsonOk(results), timings);
  } catch (e) {
    perf.finish({ kind: "read", forceLog: true });
    return jsonError(e instanceof Error ? e.message : "Check failed", 400);
  }
}
