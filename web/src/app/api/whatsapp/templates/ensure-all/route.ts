import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireOwner, isResponse } from "@/lib/api";
import { ensureBookingBillTemplate } from "@/lib/services/whatsapp/bookingBillTemplate";
import {
  ensureAllSlipTemplates,
  SLIP_TEMPLATE_DEFS,
} from "@/lib/services/whatsapp/slipTemplates";
import { ensureCustomerWelcomeTemplate } from "@/lib/services/whatsapp/welcomeTemplate";

/** Owner-only: submit all slip + marketing templates to Meta. */
export async function POST(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  let includeMarketing = true;
  try {
    const body = await req.json();
    if (body?.includeMarketing === false) includeMarketing = false;
  } catch {
    // empty body ok
  }

  try {
    const booking = await ensureBookingBillTemplate();
    const welcome = await ensureCustomerWelcomeTemplate();
    const slips = await ensureAllSlipTemplates({ includeMarketing });
    return jsonOk({
      ok: booking.ok && welcome.ok && slips.ok,
      booking_confirmation: booking,
      customer_welcome: welcome,
      slips: slips.results,
      catalog: SLIP_TEMPLATE_DEFS.map((d) => ({
        key: d.key,
        name: d.name,
        category: d.category,
        kind: d.kind,
        description: d.description,
      })),
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed to submit templates", 500);
  }
}

export async function GET(_req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  return jsonOk({
    catalog: SLIP_TEMPLATE_DEFS.map((d) => ({
      key: d.key,
      name: d.name,
      category: d.category,
      kind: d.kind,
      description: d.description,
    })),
    note: "POST this endpoint to submit missing templates to Meta for approval.",
  });
}
