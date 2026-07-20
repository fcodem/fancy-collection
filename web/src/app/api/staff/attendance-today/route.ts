import { NextRequest } from "next/server";
import { jsonOk, requireOwner, isResponse } from "@/lib/api";
import { getStaffAttendanceToday } from "@/lib/services/staffOps";

export async function GET(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;
  const date = req.nextUrl.searchParams.get("date") || new Date().toISOString().slice(0, 10);
  const data = await getStaffAttendanceToday(date);
  return jsonOk(data);
}
