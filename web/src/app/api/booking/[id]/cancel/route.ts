import { NextRequest } from "next/server";
import { cancelBooking } from "@/lib/services/operations";
import { jsonError, jsonOk, requireUser, isResponse } from "@/lib/api";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    const refundAmount = Number(body.refund_amount) || 0;
    await cancelBooking(parseInt(id, 10), refundAmount);
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed to cancel booking");
  }
}
