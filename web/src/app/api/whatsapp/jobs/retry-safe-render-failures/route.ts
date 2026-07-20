import { NextRequest } from "next/server";
import { jsonError, jsonOk, isResponse, requireOwner, requireJsonContentType } from "@/lib/api";
import {
  processWhatsAppJobQueue,
  retrySafeRenderFailureJobs,
} from "@/lib/services/whatsapp/jobQueue";

export async function POST(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  const ctErr = requireJsonContentType(req);
  if (ctErr) return ctErr;

  let body: { dryRun?: boolean; process?: boolean } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return jsonError("Invalid JSON body");
  }

  try {
    const summary = await retrySafeRenderFailureJobs({
      dryRun: body.dryRun === true,
      limit: 500,
    });

    let queueSummary;
    if (!body.dryRun && body.process !== false && summary.requeued.length > 0) {
      queueSummary = await processWhatsAppJobQueue(Math.min(summary.requeued.length, 10));
    }

    return jsonOk({
      ok: true,
      ...summary,
      queue: queueSummary ?? null,
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Safe render retry failed");
  }
}
