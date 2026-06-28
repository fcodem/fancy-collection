import { NextRequest } from "next/server";
import { saveReturn } from "@/lib/services/operations";
import { saveUpload } from "@/lib/upload";
import { jsonError, jsonOk, requireUser, isResponse, requireJsonContentType } from "@/lib/api";
import { triggerWhatsAppSlipJobs } from "@/lib/services/whatsapp/slipScheduling";

type IncompleteItemPayload = {
  booking_item_id: number;
  is_incomplete: boolean;
  incomplete_notes?: string;
  security_held?: number;
  incomplete_photo?: string;
};

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

      let items: IncompleteItemPayload[] = [];
      const itemsRaw = form.get("items");
      if (itemsRaw) {
        try {
          items = JSON.parse(String(itemsRaw)) as IncompleteItemPayload[];
        } catch {
          return jsonError("Invalid items payload");
        }

        for (const item of items) {
          if (!item.is_incomplete) continue;
          const itemPhoto = form.get(`item_photo_${item.booking_item_id}`);
          if (itemPhoto instanceof File && itemPhoto.size > 0) {
            item.incomplete_photo = await saveUpload(itemPhoto);
          }
        }
      }

      const booking = await saveReturn(
        bookingId,
        action,
        {
          incomplete_notes,
          security_held,
          incomplete_photo,
          items: items.length ? items : undefined,
        },
        user.username,
      );
      if (
        booking?.status === "returned" ||
        action === "mark_item_returned" ||
        action === "incomplete_return" ||
        action === "resolve_incomplete_return"
      ) {
        void triggerWhatsAppSlipJobs(bookingId, "return", req.nextUrl.origin, user.username);
      }
      return jsonOk({ ok: true, id: booking?.id, status: booking?.status });
    }

    const _ct = requireJsonContentType(req);
    if (_ct) return _ct;
    const body = await req.json();
    const action = String(body.action || "");
    const booking = await saveReturn(
      bookingId,
      String(body.action || ""),
      {
        booking_item_id: body.booking_item_id ? Number(body.booking_item_id) : undefined,
        incomplete_notes: body.incomplete_notes,
        security_held: Number(body.security_held || 0),
        items: Array.isArray(body.items) ? body.items : undefined,
      },
      user.username,
    );
    if (
      booking?.status === "returned" ||
      action === "mark_item_returned" ||
      action === "incomplete_return" ||
      action === "resolve_incomplete_return"
    ) {
      void triggerWhatsAppSlipJobs(bookingId, "return", req.nextUrl.origin, user.username);
    }
    return jsonOk({ ok: true, id: booking?.id, status: booking?.status });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Save failed");
  }
}
