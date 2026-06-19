import { NextRequest } from "next/server";
import { getAttendanceCalendar } from "@/lib/services/staffOps";
import { jsonError, jsonOk, requireUser, isResponse } from "@/lib/api";

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const staffId = parseInt(req.nextUrl.searchParams.get("staff_id") || "0", 10);
  const month = req.nextUrl.searchParams.get("month") || new Date().toISOString().slice(0, 7);
  if (!staffId) return jsonError("staff_id required");
  const data = await getAttendanceCalendar(staffId, month);
  return jsonOk(data);
}
