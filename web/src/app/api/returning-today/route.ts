import { NextRequest } from "next/server";
import { getReturningToday } from "@/lib/services/operations";
import { jsonOk, requireUserReadOnly, isResponse } from "@/lib/api";
import { todayIso } from "@/lib/constants";

export async function GET(req: NextRequest) {
  const user = await requireUserReadOnly();
  if (isResponse(user)) return user;
  const date = req.nextUrl.searchParams.get("date") || todayIso();
  const data = await getReturningToday(date);
  return jsonOk(data);
}
