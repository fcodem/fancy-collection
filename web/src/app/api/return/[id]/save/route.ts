import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { saveReturn } from "@/lib/services/operations";
import { saveUpload } from "@/lib/upload";
import { jsonError, jsonOk, requireUser, isResponse, requireJsonContentType } from "@/lib/api";
import {
  finalizeSlipTrigger,
} from "@/lib/services/whatsapp/slipDebounce";
import {
  newlyReturnedItemIdsFromAction,
  newlyIncompleteItemIdsFromAction,
} from "@/lib/slipDelta";

type IncompleteItemPayload = {
  booking_item_id: number;
  is_incomplete: boolean;
  incomplete_notes?: string;
  security_held?: number;
  incomplete_photo?: string;
};

async function loadBookingItemsBefore(bookingId: number) {
  const row = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      bookingItems: {
        select: {
          id: true,
          isDelivered: true,
          isReturned: true,
          isIncompleteReturn: true,
          isCancelled: true,
        },
      },
    },
  });
  return row?.bookingItems ?? [];
}

function slipOptsForReturnAction(
  action: string,
  data: {
    booking_item_id?: number;
    booking_item_ids?: number[];
    items?: IncompleteItemPayload[];
  },
  beforeItems: Awaited<ReturnType<typeof loadBookingItemsBefore>>,
  requestOrigin: string,
  createdBy: string,
) {
  const returnItemIds = newlyReturnedItemIdsFromAction(action, data, beforeItems);
  const incompleteItemIds = newlyIncompleteItemIdsFromAction(action, data, beforeItems);
  return {
    requestOrigin,
    createdBy,
    returnItemIds,
    incompleteItemIds,
    hasWork: returnItemIds.length > 0 || incompleteItemIds.length > 0,
  };
}

const IMMEDIATE_RETURN_SLIP_ACTIONS = new Set([
  "mark_returned",
  "incomplete_return",
  "resolve_incomplete_return",
]);

async function triggerReturnSlipIfNeeded(
  bookingId: number,
  action: string,
  slip: ReturnType<typeof slipOptsForReturnAction>,
) {
  const baseOpts = {
    requestOrigin: slip.requestOrigin,
    createdBy: slip.createdBy,
    ...(slip.returnItemIds.length ? { returnItemIds: slip.returnItemIds } : {}),
    ...(slip.incompleteItemIds.length
      ? { incompleteItemIds: slip.incompleteItemIds }
      : {}),
  };

  try {
    if (
      action === "mark_item_returned" ||
      action === "mark_items_returned" ||
      IMMEDIATE_RETURN_SLIP_ACTIONS.has(action)
    ) {
      // Always finalize for full return actions — even if delta IDs are empty
      // (e.g. race), scheduleReturnSlipsForBooking can still pick unsent items.
      if (
        !slip.hasWork &&
        (action === "mark_item_returned" || action === "mark_items_returned")
      ) {
        return;
      }
      await finalizeSlipTrigger(bookingId, "return", baseOpts);
    }
  } catch (e) {
    console.error("[return save] WhatsApp slip error:", e);
  }
}

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

      const beforeItems = await loadBookingItemsBefore(bookingId);
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
      const slip = slipOptsForReturnAction(
        action,
        { items: items.length ? items : undefined },
        beforeItems,
        req.nextUrl.origin,
        user.username,
      );
      if (slip.hasWork || IMMEDIATE_RETURN_SLIP_ACTIONS.has(action)) {
        await triggerReturnSlipIfNeeded(bookingId, action, slip);
      }
      return jsonOk({ ok: true, id: booking?.id, status: booking?.status });
    }

    const _ct = requireJsonContentType(req);
    if (_ct) return _ct;
    const body = await req.json();
    const action = String(body.action || "");
    const beforeItems = await loadBookingItemsBefore(bookingId);
    const booking = await saveReturn(
      bookingId,
      String(body.action || ""),
      {
        booking_item_id: body.booking_item_id ? Number(body.booking_item_id) : undefined,
        booking_item_ids: Array.isArray(body.booking_item_ids)
          ? body.booking_item_ids.map(Number).filter((n: number) => n > 0)
          : undefined,
        incomplete_notes: body.incomplete_notes,
        security_held: Number(body.security_held || 0),
        items: Array.isArray(body.items) ? body.items : undefined,
      },
      user.username,
    );
    const slip = slipOptsForReturnAction(
      action,
      {
        booking_item_id: body.booking_item_id ? Number(body.booking_item_id) : undefined,
        booking_item_ids: Array.isArray(body.booking_item_ids)
          ? body.booking_item_ids.map(Number).filter((n: number) => n > 0)
          : undefined,
        items: Array.isArray(body.items) ? body.items : undefined,
      },
      beforeItems,
      req.nextUrl.origin,
      user.username,
    );
    if (slip.hasWork || IMMEDIATE_RETURN_SLIP_ACTIONS.has(action)) {
      await triggerReturnSlipIfNeeded(bookingId, action, slip);
    }
    return jsonOk({ ok: true, id: booking?.id, status: booking?.status });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Save failed");
  }
}
