import { NextRequest, after } from "next/server";
import prisma from "@/lib/prisma";
import {
  jsonError,
  jsonOk,
  requireUser,
  isResponse,
  requireJsonContentType,
  requireOperationId,
} from "@/lib/api";
import { BookingFormSchema, formatZodValidationError } from "@/lib/validation";
import { catalogPhotoRef } from "@/lib/catalogPhotoRef";
import { createBookingWithSideEffects } from "@/lib/services/bookingCreateOrchestration";
import type { BookingCreateTimings } from "@/lib/services/bookingCreateFast";
import { createPerfTimer, withServerTiming } from "@/lib/perfTiming";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const perf = createPerfTimer("POST /api/booking");
  const _ct = requireJsonContentType(req);
  if (_ct) return _ct;

  perf.mark("auth");
  const user = await requireUser();
  perf.endStage("authMs", "auth");
  perf.addQueries(1);
  if (isResponse(user)) return user;
  try {
    perf.mark("parse");
    const raw = await req.json();
    perf.endStage("parseMs", "parse");

    const operationIdOrErr = requireOperationId(
      raw.operation_id ?? raw.client_request_id,
    );
    if (isResponse(operationIdOrErr)) return operationIdOrErr;
    const operationId = operationIdOrErr;

    perf.mark("validation");
    const parseResult = BookingFormSchema.safeParse(raw);
    perf.endStage("validationMs", "validation");
    if (!parseResult.success) {
      return jsonError(formatZodValidationError(parseResult.error), 400);
    }
    const body = {
      ...parseResult.data,
      client_request_id: operationId,
      operation_id: operationId,
    };
    perf.setItemCount(Array.isArray(body.items) ? body.items.length : 0);
    let createTimings: BookingCreateTimings | undefined;
    const createStartedAt = Date.now();
    // createBookingWithSideEffects performs one idempotency pre-check.
    perf.addQueries(1);
    const result = await createBookingWithSideEffects(body, user, {}, {
      nextAfter: after,
      origin: req.nextUrl.origin,
      onTiming: (timings) => {
        createTimings = timings;
      },
    });
    if (createTimings) {
      perf.set("inventoryReadMs", createTimings.inventoryReadMs);
      perf.set("conflictCheckMs", createTimings.conflictCheckMs);
      perf.set("serialAllocationMs", createTimings.serialAllocationMs);
      perf.set("transactionMs", createTimings.transactionMs);
      perf.set("postCommitMs", createTimings.postCommitMs);
      perf.addQueries(createTimings.queryCount);
    } else {
      // Idempotent replay returned from the single pre-check query.
      perf.set("inventoryReadMs", Date.now() - createStartedAt);
      perf.set("conflictCheckMs", 0);
      perf.set("serialAllocationMs", 0);
      perf.set("transactionMs", 0);
      perf.set("postCommitMs", 0);
    }
    const timings = perf.finish({ kind: "mutation" });
    return withServerTiming(
      jsonOk({
        ok: true,
        id: result.id,
        serial: result.serial,
        reused: result.reused || undefined,
        slip_queued: !result.reused,
      }),
      timings,
    );
  } catch (e) {
    perf.finish({ kind: "mutation", forceLog: true });
    const msg = e instanceof Error ? e.message : "Failed to create booking";
    if (/operation_id was already used with a different payload/i.test(msg)) {
      return jsonError(msg, 409, {
        code: "IDEMPOTENCY_CONFLICT",
        retryable: false,
      });
    }
    return jsonError(msg);
  }
}

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const id = parseInt(req.nextUrl.searchParams.get("id") || "0", 10);
  if (!id) return jsonError("Booking id required");
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { bookingItems: { include: { item: true } } },
  });
  if (!booking) return jsonError("Not found", 404);
  return jsonOk({
    id: booking.id,
    monthly_serial: booking.monthlySerial,
    customer_name: booking.customerName,
    customer_address: booking.customerAddress,
    contact_1: booking.contact1,
    whatsapp_no: booking.whatsappNo,
    venue: booking.venue,
    security_deposit: booking.securityDeposit,
    common_notes: booking.commonNotes,
    staff_names: booking.staffNames ? booking.staffNames.split(", ") : [],
    delivery_date: booking.deliveryDate.toISOString().slice(0, 10),
    delivery_time: booking.deliveryTime,
    return_date: booking.returnDate.toISOString().slice(0, 10),
    return_time: booking.returnTime,
    items: booking.bookingItems.map((bi) => ({
      item_id: bi.itemId,
      dress_name: bi.dressName,
      category: bi.category,
      size: bi.size,
      price: bi.price,
      advance: bi.advance,
      notes: bi.notes || "",
      photo: bi.item ? catalogPhotoRef(bi.item) : "",
    })),
  });
}
