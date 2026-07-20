import { NextRequest } from "next/server";
import { jsonOk, requireOwner, isResponse } from "@/lib/api";
import { getStaffSalaryDashboard } from "@/lib/services/staffOps";

export async function GET(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;
  const staffId = parseInt(req.nextUrl.searchParams.get("staff_id") || "0", 10);
  const month = req.nextUrl.searchParams.get("month") || new Date().toISOString().slice(0, 7);
  if (!staffId) {
    return jsonOk({
      calendar: { days: {}, entries: [], total: 0 },
      summary: [],
    });
  }
  const data = await getStaffSalaryDashboard(staffId, month);
  return jsonOk(data);
}
