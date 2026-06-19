import { NextRequest } from "next/server";
import { saveReturn } from "@/lib/services/operations";
import { saveUpload } from "@/lib/upload";
import { jsonError, jsonOk, requireUser, isResponse } from "@/lib/api";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id } = await params;
  const bookingId = parseInt(id, 10);

  try {
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const action = String(form.get("action") || "");
      const incomplete_notes = String(form.get("incomplete_notes") || "");
      const security_held = Number(form.get("security_held") || 0);
      let incomplete_photo: string | undefined;

      const photo = form.get("incomplete_photo");
      if (photo instanceof File && photo.size > 0) {
        incomplete_photo = await saveUpload(photo);
      }

      const booking = await saveReturn(bookingId, action, {
        incomplete_notes,
        security_held,
        incomplete_photo,
      });
      return jsonOk({ ok: true, id: booking?.id, status: booking?.status });
    }

    const body = await req.json();
    const booking = await saveReturn(bookingId, body.action, {
      incomplete_notes: body.incomplete_notes,
      security_held: Number(body.security_held || 0),
    });
    return jsonOk({ ok: true, id: booking?.id, status: booking?.status });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Save failed");
  }
}
