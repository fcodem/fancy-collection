import { NextRequest } from "next/server";
import { getMonthlySaleCached } from "@/lib/services/finance";
import { jsonOk, requireOwner, isResponse } from "@/lib/api";

export async function GET(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;
  const month = req.nextUrl.searchParams.get("month") || new Date().toISOString().slice(0, 7);
  return jsonOk(await getMonthlySaleCached(month));
}
