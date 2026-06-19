import { NextRequest } from "next/server";
import { saveDelivery } from "@/lib/services/operations";
import { jsonError, jsonOk, requireUser, isResponse } from "@/lib/api";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id } = await params;
  try {
    const body = await req.json();
    const booking = await saveDelivery(parseInt(id, 10), {
      remaining_collected: Number(body.remaining_collected || 0),
      security_collected: Number(body.security_collected || 0),
      delivery_notes: body.delivery_notes || "",
      mark_delivered: Boolean(body.mark_delivered),
    });
    return jsonOk({ ok: true, id: booking.id, status: booking.status });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Save failed");
  }
}
