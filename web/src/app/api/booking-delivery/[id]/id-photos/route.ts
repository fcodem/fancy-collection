import { NextRequest } from "next/server";
import { saveDeliveryIdPhotos } from "@/lib/services/operations";
import { jsonError, jsonOk, requireUser, isResponse } from "@/lib/api";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id } = await params;
  const bookingId = parseInt(id, 10);

  try {
    const form = await req.formData();
    const id_photo_1 = form.get("id_photo_1");
    const id_photo_2 = form.get("id_photo_2");

    const booking = await saveDeliveryIdPhotos(
      bookingId,
      {
        id_photo_1: id_photo_1 instanceof File ? id_photo_1 : null,
        id_photo_2: id_photo_2 instanceof File ? id_photo_2 : null,
      },
      user.username,
    );

    return jsonOk({
      ok: true,
      id_photo_1: booking.idPhoto1,
      id_photo_2: booking.idPhoto2,
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed to save ID photos");
  }
}
