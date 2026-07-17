import prisma from "@/lib/prisma";
import { jsonOk, jsonError } from "@/lib/api";
import { getCurrentUserReadOnly } from "@/lib/auth";
import { todayIso } from "@/lib/constants";
import { whereOverduePendingDelivery } from "@/lib/bookingDateQuery";
import { memoryCachedQuery } from "@/lib/perfCache";

/** Nav badge counts — cached ~45s (not financial). */
export async function GET() {
  const user = await getCurrentUserReadOnly();
  if (!user) return jsonError("Please log in to continue.", 401);

  const started = Date.now();
  try {
    const overdueDeliveryCount = await memoryCachedQuery(
      ["nav-overdue-delivery", todayIso()],
      async () =>
        prisma.booking.count({
          where: await whereOverduePendingDelivery(todayIso()),
        }),
      45,
    );
    const totalMs = Date.now() - started;
    if (totalMs > 500) {
      console.log(`[perf] route=/api/dashboard/nav-counts totalMs=${totalMs}`);
    }
    return jsonOk({ overdue_delivery_count: overdueDeliveryCount });
  } catch (e) {
    console.error("[nav-counts]", e);
    const msg = e instanceof Error ? e.message : "";
    if (/P1001|Can't reach database|ECONNREFUSED|ETIMEDOUT/i.test(msg)) {
      return jsonError("The database is temporarily unavailable. Please try again.", 503);
    }
    return jsonError("Failed to load navigation counts", 500);
  }
}
