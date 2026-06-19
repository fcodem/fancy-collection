import { NextRequest } from "next/server";
import { getYearlySale } from "@/lib/services/finance";
import { jsonOk, requireOwner, isResponse } from "@/lib/api";

export async function GET(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;
  return jsonOk(await getYearlySale(
    req.nextUrl.searchParams.get("from") || undefined,
    req.nextUrl.searchParams.get("to") || undefined
  ));
}
