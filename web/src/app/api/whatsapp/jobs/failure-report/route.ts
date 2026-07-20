import { jsonOk, isResponse, requireOwner } from "@/lib/api";
import { getWhatsAppRenderFailureReport } from "@/lib/services/whatsapp/whatsappJobClassification";

export async function GET() {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  const report = await getWhatsAppRenderFailureReport(500);
  return jsonOk(report);
}
