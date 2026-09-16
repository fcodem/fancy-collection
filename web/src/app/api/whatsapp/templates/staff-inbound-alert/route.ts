import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireOwner, isResponse } from "@/lib/api";
import {
  ensureStaffInboundAlertTemplate,
  getStaffInboundAlertTemplateStatus,
  STAFF_INBOUND_ALERT_TEMPLATE_BODY,
  staffInboundAlertTemplateLanguage,
  staffInboundAlertTemplateName,
} from "@/lib/services/whatsapp/staffInboundAlertTemplate";

/** GET — status of the staff inbound alert template on Meta. */
export async function GET() {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  const status = await getStaffInboundAlertTemplateStatus();
  return jsonOk({
    status,
    defaults: {
      name: staffInboundAlertTemplateName(),
      language: staffInboundAlertTemplateLanguage(),
      category: "UTILITY",
      previewBody: STAFF_INBOUND_ALERT_TEMPLATE_BODY,
    },
  });
}

/** POST — submit staff inbound alert template to Meta for approval. */
export async function POST(_req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  try {
    const result = await ensureStaffInboundAlertTemplate();
    const status = await getStaffInboundAlertTemplateStatus();
    return jsonOk({ ...result, status });
  } catch (e) {
    return jsonError(
      e instanceof Error ? e.message : "Failed to submit staff inbound alert template",
      500,
    );
  }
}
