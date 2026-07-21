import { jsonOk, requireOwner, isResponse } from "@/lib/api";
import { getBusinessWhatsAppLocation } from "@/lib/services/whatsapp/whatsappLocation";

export async function GET() {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  const business = getBusinessWhatsAppLocation();
  return jsonOk({
    configured: Boolean(business),
    business,
  });
}
