import { aisensyCampaign, aisensyProjectId, isAisensyConfigured } from "@/lib/aisensy";
import { jsonOk, requireOwner, isResponse } from "@/lib/api";

export async function GET() {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  return jsonOk({
    configured: isAisensyConfigured(),
    projectId: aisensyProjectId() || null,
    campaigns: {
      booking: aisensyCampaign("booking") || null,
      prospect: aisensyCampaign("prospect") || null,
      return: aisensyCampaign("return") || null,
      default: aisensyCampaign("default") || null,
    },
    dashboardUrl: aisensyProjectId()
      ? `https://www.app.aisensy.com/projects/${aisensyProjectId()}/dashboard`
      : "https://www.app.aisensy.com/",
  });
}
