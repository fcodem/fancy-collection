import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireOwner, isResponse } from "@/lib/api";
import { ensureReusableBroadcastTemplate } from "@/lib/services/whatsapp/slipTemplates";

/** Owner-only: submit fc_reusable_broadcast (poster + editable message + Location & Instagram) to Meta. */
export async function POST(_req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  try {
    const result = await ensureReusableBroadcastTemplate();
    if (!result.ok) {
      return jsonError(result.error || "Failed to submit template", 500);
    }
    return jsonOk({
      ok: true,
      template: result.name,
      status: result.status,
      message:
        result.message ||
        "Reusable broadcast template submitted to Meta — wait for APPROVED, then use it under Broadcast.",
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed to submit template", 500);
  }
}
