import { NextRequest } from "next/server";
import { dashboardSearchBookings } from "@/lib/services/dashboardSearch";
import { jsonOk, requireUserReadOnly, isResponse } from "@/lib/api";
import { todayIso } from "@/lib/constants";

export async function GET(req: NextRequest) {
  const user = await requireUserReadOnly();
  if (isResponse(user)) return user;

  const q = req.nextUrl.searchParams.get("q")?.trim() || "";
  const date = req.nextUrl.searchParams.get("date") || todayIso();

  const { mode, results } = await dashboardSearchBookings(q, date);
  return jsonOk({ mode, results });
}
