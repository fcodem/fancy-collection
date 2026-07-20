import { NextRequest } from "next/server";
import { getReturningTodayCached } from "@/lib/services/operations";
import { jsonOk, requireUserReadOnly, isResponse } from "@/lib/api";
import { todayIso } from "@/lib/constants";

export async function GET(req: NextRequest) {
  const user = await requireUserReadOnly();
  if (isResponse(user)) return user;
  const date = req.nextUrl.searchParams.get("date") || todayIso();
  const data = await getReturningTodayCached(date);
  const res = jsonOk(data);
  res.headers.set("Cache-Control", "private, max-age=15, stale-while-revalidate=30");
  return res;
}
