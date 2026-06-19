import { NextRequest } from "next/server";
import { getStaffWork } from "@/lib/services/staffOps";
import { jsonOk, requireOwner, isResponse } from "@/lib/api";
import { todayIso } from "@/lib/constants";

export async function GET(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;
  const today = todayIso();
  const from = req.nextUrl.searchParams.get("from") || today.slice(0, 8) + "01";
  const to = req.nextUrl.searchParams.get("to") || today;
  const data = await getStaffWork(from, to);
  return jsonOk(data);
}
