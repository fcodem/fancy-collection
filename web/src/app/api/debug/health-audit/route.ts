import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { getAvailableItemsApi } from "@/lib/booking";
import { bookingDateCheck } from "@/lib/services/operations";
import { parseDate, formatDate, todayIso } from "@/lib/constants";
import { debugLog } from "@/lib/debugLog";
import { jsonOk, requireUser, isResponse } from "@/lib/api";

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (isResponse(user)) {
    // #region agent log
    debugLog("health-audit/route.ts", "audit auth failed", { status: 401 }, "B");
    // #endregion
    return user;
  }

  const checks: Record<string, unknown> = { user: user.username, role: user.role };
  let failed = 0;

  try {
    const [userCount, itemCount, bookingCount] = await Promise.all([
      prisma.user.count(),
      prisma.clothingItem.count({ where: { status: "available" } }),
      prisma.booking.count({ where: { status: { in: ["booked", "delivered"] } } }),
    ]);
    checks.db = { ok: true, userCount, itemCount, bookingCount };
    // #region agent log
    debugLog("health-audit/route.ts", "db counts", { userCount, itemCount, bookingCount }, "E");
    // #endregion
  } catch (e) {
    failed++;
    checks.db = { ok: false, error: e instanceof Error ? e.message : "db error" };
    // #region agent log
    debugLog("health-audit/route.ts", "db error", { error: checks.db }, "E");
    // #endregion
  }

  const today = todayIso();
  const returnDay = formatDate(parseDate(today), "iso");
  try {
    const parsed = parseDate(today);
    const roundtrip = formatDate(parsed, "iso");
    checks.dates = { today, parsedUtc: parsed.toISOString(), roundtrip, match: roundtrip === today };
    // #region agent log
    debugLog("health-audit/route.ts", "date roundtrip", checks.dates as Record<string, unknown>, "A");
    // #endregion
    if (roundtrip !== today) failed++;
  } catch (e) {
    failed++;
    checks.dates = { ok: false, error: e instanceof Error ? e.message : "date error" };
  }

  try {
    const avail = await getAvailableItemsApi(today, returnDay, "", undefined);
    const freeCount = avail.free_items?.length ?? 0;
    const warnCount = (avail.free_items || []).filter(
      (i) => i.returning_warning || i.booked_warning,
    ).length;
    checks.availability = { ok: true, freeCount, warnCount, delivery: today, return: returnDay };
    // #region agent log
    debugLog("health-audit/route.ts", "availability sample", checks.availability as Record<string, unknown>, "A");
    // #endregion
  } catch (e) {
    failed++;
    checks.availability = { ok: false, error: e instanceof Error ? e.message : "availability error" };
    // #region agent log
    debugLog("health-audit/route.ts", "availability error", { error: checks.availability }, "A");
    // #endregion
  }

  try {
    const sampleItem = await prisma.clothingItem.findFirst({ where: { status: "available" } });
    if (sampleItem) {
      const dc = await bookingDateCheck(0, today, returnDay, [sampleItem.id]);
      checks.dateCheck = {
        ok: true,
        itemId: sampleItem.id,
        statuses: dc.map((r) => r.status),
      };
      // #region agent log
      debugLog("health-audit/route.ts", "date-check sample", checks.dateCheck as Record<string, unknown>, "D");
      // #endregion
    } else {
      checks.dateCheck = { ok: false, error: "no available items" };
    }
  } catch (e) {
    failed++;
    checks.dateCheck = { ok: false, error: e instanceof Error ? e.message : "date-check error" };
    // #region agent log
    debugLog("health-audit/route.ts", "date-check error", { error: checks.dateCheck }, "D");
    // #endregion
  }

  checks.summary = { failed, ok: failed === 0 };
  // #region agent log
  debugLog("health-audit/route.ts", "audit complete", { failed, ok: failed === 0 }, "E");
  // #endregion

  return jsonOk(checks);
}
