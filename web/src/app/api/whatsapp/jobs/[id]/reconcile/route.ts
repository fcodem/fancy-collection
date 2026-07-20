import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireOwner, isResponse, requireJsonContentType } from "@/lib/api";
import {
  reconcileWhatsAppProviderUnknownJob,
  type ReconcileAction,
} from "@/lib/services/whatsapp/whatsappJobReconcile";

const ACTIONS = new Set<ReconcileAction>([
  "mark_delivered",
  "mark_not_delivered",
  "cancel",
]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  const ct = requireJsonContentType(req);
  if (isResponse(ct)) return ct;

  const { id } = await params;
  const jobId = parseInt(id, 10);
  if (!jobId) return jsonError("Invalid job id");

  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const action = body.action as ReconcileAction;
  if (!action || !ACTIONS.has(action)) {
    return jsonError("action must be mark_delivered, mark_not_delivered, or cancel", 400);
  }

  try {
    const job = await reconcileWhatsAppProviderUnknownJob(jobId, user.id, action);
    return jsonOk({
      ok: true,
      job: {
        id: job.id,
        status: job.status,
        failed_reason: job.failedReason,
        payload: job.payload,
      },
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Reconciliation failed");
  }
}
