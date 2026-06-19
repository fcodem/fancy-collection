import { NextRequest } from "next/server";
import { getStaffAttendance } from "@/lib/services/staffOps";
import { jsonOk, requireUser, isResponse } from "@/lib/api";

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const month = req.nextUrl.searchParams.get("month") || new Date().toISOString().slice(0, 7);
  const data = await getStaffAttendance(month);
  return jsonOk(data);
}
