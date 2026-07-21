import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireOwner, isResponse } from "@/lib/api";
import {
  ensureCustomerWelcomeTemplate,
  getCustomerWelcomeTemplateDefaults,
  getCustomerWelcomeTemplateStatus,
} from "@/lib/services/whatsapp/welcomeTemplate";

/** GET — status of the customer welcome template on Meta. */
export async function GET() {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  const status = await getCustomerWelcomeTemplateStatus();
  const defaults = getCustomerWelcomeTemplateDefaults();

  return jsonOk({
    status,
    defaults: {
      name: defaults.name,
      language: defaults.language,
      category: defaults.category,
      previewBody: defaults.previewBody,
      buttons: defaults.components
        .filter((c) => c.type === "BUTTONS")
        .flatMap((c) => ("buttons" in c ? c.buttons : [])),
    },
  });
}

/** POST — submit customer welcome template to Meta for approval. */
export async function POST(_req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  try {
    const result = await ensureCustomerWelcomeTemplate();
    const status = await getCustomerWelcomeTemplateStatus();
    return jsonOk({ ...result, status });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed to submit welcome template", 500);
  }
}
