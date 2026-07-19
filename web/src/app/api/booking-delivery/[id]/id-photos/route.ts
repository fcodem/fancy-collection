import { NextRequest, NextResponse } from "next/server";
import { saveDeliveryIdPhotos } from "@/lib/services/operations";
import { jsonOk, requireUser, isResponse } from "@/lib/api";
import { formDataToFile } from "@/lib/formDataFile";
import { IdProofUploadError, idProofErrorHttpStatus } from "@/lib/upload";

function idProofFailureResponse(
  message: string,
  status: number,
  code: string,
  requestId: string,
  bookingId: number,
) {
  console.error(
    `[id-proof-upload] requestId=${requestId} bookingId=${bookingId} code=${code} status=${status}`,
  );
  return NextResponse.json({ ok: false, code, error: message }, { status });
}

function logIdProofSuccess(requestId: string, bookingId: number, partial?: boolean) {
  console.info(
    `[id-proof-upload] requestId=${requestId} bookingId=${bookingId} code=OK status=200${partial ? " partial=true" : ""}`,
  );
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id } = await params;
  const bookingId = parseInt(id, 10);
  const requestId = req.headers.get("x-request-id") || crypto.randomUUID().slice(0, 8);

  try {
    const form = await req.formData();
    const id_photo_1 = formDataToFile(form.get("id_photo_1"), "id_photo_1.jpg");
    const id_photo_2 = formDataToFile(form.get("id_photo_2"), "id_photo_2.jpg");

    if (!id_photo_1 && !id_photo_2) {
      return idProofFailureResponse(
        "Choose at least one ID photo to upload.",
        400,
        "NO_FILE",
        requestId,
        bookingId,
      );
    }

    const { booking, partialFailure } = await saveDeliveryIdPhotos(
      bookingId,
      { id_photo_1, id_photo_2 },
      user.username,
    );

    logIdProofSuccess(requestId, bookingId, Boolean(partialFailure));

    return jsonOk({
      ok: true,
      id_photo_1: booking.idPhoto1,
      id_photo_2: booking.idPhoto2,
      ...(partialFailure
        ? {
            partialFailure,
            warning: `ID photo ${partialFailure.slot} was not saved: ${partialFailure.message}`,
          }
        : {}),
    });
  } catch (e) {
    if (e instanceof IdProofUploadError) {
      const status = idProofErrorHttpStatus(e.code);
      return idProofFailureResponse(e.message, status, e.code, requestId, bookingId);
    }
    const message = e instanceof Error ? e.message : "Failed to save ID photos";
    return idProofFailureResponse(message, 500, "INTERNAL_ERROR", requestId, bookingId);
  }
}
