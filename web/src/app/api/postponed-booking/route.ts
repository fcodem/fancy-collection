import { NextRequest } from "next/server";
import {
  listPostponedBookingsCached,
  postponeBooking,
  resolvePostponedBooking,
  searchBookingsToPostpone,
} from "@/lib/services/postponedBooking";
import { jsonOk, jsonError, requireUser, isResponse, requireJsonContentType } from "@/lib/api";
import {
  schedulePostponementHeld,
  processWhatsAppJobQueue,
} from "@/lib/services/whatsapp/jobQueue";

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (isResponse(user)) return user;

  const mode = req.nextUrl.searchParams.get("mode");
  if (mode === "search") {
    const q = req.nextUrl.searchParams.get("q")?.trim() || "";
    const date = req.nextUrl.searchParams.get("date") || "";
    const page = req.nextUrl.searchParams.get("page");
    const pageSize = req.nextUrl.searchParams.get("pageSize");
    const result = await searchBookingsToPostpone(q, date, page, pageSize);
    return jsonOk(result);
  }

  const q = req.nextUrl.searchParams.get("q")?.trim() || "";
  const data = await listPostponedBookingsCached(q);
  return jsonOk(data);
}

export async function POST(req: NextRequest) {
  const _ct = requireJsonContentType(req);
  if (_ct) return _ct;

  const user = await requireUser();
  if (isResponse(user)) return user;

  const body = await req.json().catch(() => ({}));
  const action = body.action as string;
  const bookingId = Number(body.booking_id ?? body.bookingId);

  if (!bookingId || !Number.isFinite(bookingId)) {
    return jsonError("booking_id required", 400);
  }

  try {
    if (action === "postpone") {
      await postponeBooking(bookingId, user.username);
      await schedulePostponementHeld(bookingId, user.username);
      try {
        await processWhatsAppJobQueue(3, { bookingId });
      } catch (e) {
        console.error("[postponed-booking] WhatsApp queue error:", e);
      }
      return jsonOk({ ok: true, status: "postponed" });
    }
    if (action === "resolve") {
      await resolvePostponedBooking(bookingId, user.username);
      return jsonOk({ ok: true, deleted: true });
    }
    return jsonError("Unknown action", 400);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Request failed", 400);
  }
}
