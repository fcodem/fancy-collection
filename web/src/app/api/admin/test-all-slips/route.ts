import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireOwner, isResponse } from "@/lib/api";
import { runTestAllSlips } from "@/lib/services/testAllSlips";

/** Owner-only: run all slip + WhatsApp test cases (dev/staging). */
export async function POST(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  try {
    const body = await req.json().catch(() => ({}));
    const phone = String(body.phone || "8077843874").replace(/\D/g, "").slice(-10);
    const deliveryDate = String(body.delivery_date || "2026-07-10");
    const returnDate = String(body.return_date || "2026-08-06");

    const result = await runTestAllSlips({
      phone,
      deliveryDate,
      returnDate,
      requestOrigin: req.nextUrl.origin,
      createdBy: user.username,
    });

    return jsonOk({ ok: true, ...result });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Slip test failed", 500);
  }
}
