import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireOwner, isResponse } from "@/lib/api";
import { getPremiumSlipTestRunStatus } from "@/lib/services/premiumSlipVerification";

export async function GET(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  const runId = req.nextUrl.searchParams.get("runId");
  if (!runId) return jsonError("runId required", 400);

  const status = getPremiumSlipTestRunStatus(runId);
  if (!status) return jsonError("Test run not found or expired", 404);
  return jsonOk({ ok: true, ...status });
}
