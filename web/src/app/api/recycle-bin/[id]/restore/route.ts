import { restoreBooking, RestoreAvailabilityError } from "@/lib/services/operations";
import { jsonError, jsonOk, requireOwner, isResponse, requireJsonContentType } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const _ct = requireJsonContentType(req);
  if (_ct) return _ct;

  const user = await requireOwner();
  if (isResponse(user)) return user;
  const { id } = await params;
  const bookingId = parseInt(id, 10);
  let acknowledgeWarnings = false;
  try {
    const body = await req.json();
    acknowledgeWarnings = Boolean(body?.acknowledge_warnings);
  } catch {
    /* empty body */
  }

  try {
    await restoreBooking(bookingId, user.username, { acknowledgeWarnings });
    return jsonOk({ ok: true });
  } catch (e) {
    if (e instanceof RestoreAvailabilityError) {
      return NextResponse.json(
        {
          error: e.message,
          code: e.code,
          canRestore: e.check.canRestore,
          hasWarnings: e.check.hasWarnings,
          booking: e.check.booking,
          results: e.check.results,
        },
        { status: 409 },
      );
    }
    return jsonError(e instanceof Error ? e.message : "Failed", 400);
  }
}
