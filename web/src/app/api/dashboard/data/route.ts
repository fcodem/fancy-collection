import { getDashboardDataFresh, serializeDashboardData } from "@/lib/services/core";
import { jsonOk, jsonError, requireUserReadOnly, isResponse } from "@/lib/api";

export async function GET() {
  const user = await requireUserReadOnly();
  if (isResponse(user)) return user;
  try {
    const raw = await getDashboardDataFresh();
    return jsonOk(serializeDashboardData(raw));
  } catch (e) {
    console.error("[dashboard/data]", e);
    return jsonError("Failed to load dashboard data", 500);
  }
}
