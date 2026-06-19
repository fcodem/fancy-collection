import { NextRequest } from "next/server";
import { getSecurityDepositSummary } from "@/lib/services/finance";
import { jsonOk, requireOwner, isResponse } from "@/lib/api";

export async function GET(_req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;
  return jsonOk(await getSecurityDepositSummary());
}
