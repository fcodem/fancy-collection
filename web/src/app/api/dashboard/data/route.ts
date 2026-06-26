import { getDashboardDataFresh, serializeDashboardData } from "@/lib/services/core";
import { jsonOk, requireUserReadOnly, isResponse } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireUserReadOnly();
  if (isResponse(user)) return user;
  const raw = await getDashboardDataFresh();
  return jsonOk(serializeDashboardData(raw));
}
