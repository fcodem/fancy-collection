import { resolveIncompleteReturn } from "@/lib/services/operations";
import { jsonError, jsonOk, requireUser, isResponse } from "@/lib/api";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id } = await params;
  const booking = await resolveIncompleteReturn(parseInt(id, 10));
  if (!booking) return jsonError("Booking not found or not incomplete", 404);
  return jsonOk({ ok: true, id: booking.id, security_held: booking.securityHeld });
}
