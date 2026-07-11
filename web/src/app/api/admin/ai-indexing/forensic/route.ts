import { NextRequest } from "next/server";
import { isResponse, jsonError, jsonOk, requireOwner } from "@/lib/api";
import { buildQueueForensicReport } from "@/lib/dressChecker/queueForensic";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/admin/ai-indexing/forensic
 * Self-test snapshot for queue + worker + deployment safety.
 */
export async function GET(_req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  try {
    const report = await buildQueueForensicReport();
    return jsonOk(report);
  } catch (e) {
    console.error("[ai-indexing-forensic]", e);
    return jsonError(e instanceof Error ? e.message : "Forensic failed", 500);
  }
}
