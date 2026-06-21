import { NextRequest } from "next/server";
import { loadBookingEditFormPayload } from "@/lib/bookingEditPayload";
import { jsonOk, jsonError, requireUser, isResponse } from "@/lib/api";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (isResponse(user)) return user;

  const { id } = await ctx.params;
  const bookingId = parseInt(id, 10);
  if (!bookingId) return jsonError("Invalid booking id", 400);

  const payload = await loadBookingEditFormPayload(bookingId);
  if (!payload) return jsonError("Booking not found", 404);

  return jsonOk(payload);
}
