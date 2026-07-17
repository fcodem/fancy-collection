import { getDashboardData, serializeDashboardData } from "@/lib/services/core";
import { jsonOk, jsonError, requireUserReadOnly, isResponse } from "@/lib/api";

/** Cached dashboard JSON (~60s). Mutations never use this path. */
export async function GET() {
  const user = await requireUserReadOnly();
  if (isResponse(user)) return user;
  const started = Date.now();
  try {
    const raw = await getDashboardData();
    const totalMs = Date.now() - started;
    if (totalMs > 800) {
      console.log(`[perf] route=/api/dashboard/data totalMs=${totalMs}`);
    }
    return jsonOk(serializeDashboardData(raw));
  } catch (e) {
    console.error("[dashboard/data]", e);
    const msg = e instanceof Error ? e.message : "";
    if (/P1001|Can't reach database|ECONNREFUSED|ETIMEDOUT/i.test(msg)) {
      return jsonError("The database is temporarily unavailable. Please try again.", 503);
    }
    return jsonError("Failed to load dashboard data", 500);
  }
}
