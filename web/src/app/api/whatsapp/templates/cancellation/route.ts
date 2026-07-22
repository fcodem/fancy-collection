import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireOwner, isResponse } from "@/lib/api";
import {
  ensureSlipTemplate,
  resolveTemplateName,
  SLIP_TEMPLATE_DEFS,
} from "@/lib/services/whatsapp/slipTemplates";

const DEF = SLIP_TEMPLATE_DEFS.find((d) => d.key === "booking_cancelled");

/** Owner-only: submit booking_cancelled_v1 template to Meta. */
export async function POST(_req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  if (!DEF) return jsonError("Cancellation template definition missing", 500);

  try {
    const result = await ensureSlipTemplate(DEF);
    return jsonOk({
      ok: result.ok,
      template: {
        key: DEF.key,
        name: resolveTemplateName(DEF),
        status: result.status,
        created: result.created,
        message: result.message,
        error: result.error,
      },
      env: {
        WA_TEMPLATE_CANCELLATION: resolveTemplateName(DEF),
        WA_TEMPLATE_SLIPS_LANG: process.env.WA_TEMPLATE_SLIPS_LANG?.trim() || "en",
      },
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed to submit template", 500);
  }
}

export async function GET(_req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  if (!DEF) return jsonError("Cancellation template definition missing", 500);

  return jsonOk({
    key: DEF.key,
    name: resolveTemplateName(DEF),
    category: DEF.category,
    kind: DEF.kind,
    description: DEF.description,
    env: {
      WA_TEMPLATE_CANCELLATION: resolveTemplateName(DEF),
      WA_TEMPLATE_SLIPS_LANG: process.env.WA_TEMPLATE_SLIPS_LANG?.trim() || "en",
    },
  });
}
