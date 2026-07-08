import { NextRequest } from "next/server";
import { jsonOk, jsonError, requireUser, isResponse, requireJsonContentType } from "@/lib/api";
import { answerBookingQuery } from "@/lib/services/bookingAssistantService";

/**
 * Read-only AI Booking Assistant endpoint.
 * Authenticated users only (same access level as the New Booking page).
 * Never mutates bookings, inventory, or schema — it only reads and delegates
 * availability decisions to the existing booking engine.
 */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (isResponse(user)) return user;

  const ctError = requireJsonContentType(req);
  if (ctError) return ctError;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body.");
  }

  const query = typeof (body as { query?: unknown })?.query === "string"
    ? (body as { query: string }).query.trim()
    : "";
  if (!query) return jsonError("Please enter a question.");
  if (query.length > 500) return jsonError("Question is too long.");

  const answer = await answerBookingQuery(query);
  return jsonOk(answer);
}
