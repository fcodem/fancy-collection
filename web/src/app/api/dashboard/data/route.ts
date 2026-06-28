import { getDashboardData, serializeDashboardData } from "@/lib/services/core";
import { jsonOk, requireUserReadOnly, isResponse } from "@/lib/api";

export async function GET() {
  const user = await requireUserReadOnly();
  if (isResponse(user)) return user;
  const raw = await getDashboardData();
  return jsonOk(serializeDashboardData(raw));
}
