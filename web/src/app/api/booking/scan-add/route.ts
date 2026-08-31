import { NextRequest } from "next/server";
import { jsonOk, jsonError, requireFastReadUser, isResponse, requireJsonContentType } from "@/lib/api";
import { isOwner } from "@/lib/auth";
import { InventoryScanCodeError } from "@/lib/services/inventoryScanCode";
import {
  checkScannedDressAvailability,
  ScannedDressAvailabilityError,
} from "@/lib/services/scannedDressAvailability";
import { buildKolkataDateTimeFromBookingForm } from "@/lib/bookingTimeParse";
import { photoUrl } from "@/lib/photoUrl";

export async function POST(req: NextRequest) {
  const ct = requireJsonContentType(req);
  if (ct) return ct;
  const user = await requireFastReadUser();
  if (isResponse(user)) return user;
  if (!isOwner(user)) return jsonError("Access denied. Owner permission required.", 403);

  const body = (await req.json()) as {
    code?: string;
    delivery_date?: string;
    return_date?: string;
    delivery_time?: string;
    return_time?: string;
    exclude_booking?: number;
  };

  const code = body.code?.trim();
  if (!code) return jsonError("Scan code is required.", 400);

  const deliveryDate = body.delivery_date?.trim();
  const returnDate = body.return_date?.trim();

  if (!deliveryDate || !returnDate) {
    return jsonError("Delivery and return dates are required to check dress availability.", 400);
  }

  try {
    const result = await checkScannedDressAvailability({
      rawCode: code,
      deliveryDateTime: buildKolkataDateTimeFromBookingForm(
        deliveryDate,
        body.delivery_time,
      ),
      returnDateTime: buildKolkataDateTimeFromBookingForm(
        returnDate,
        body.return_time,
      ),
      excludeBookingId: body.exclude_booking ?? null,
    });

    if (!result.dress) {
      return jsonOk({ status: result.status, item: null });
    }

    return jsonOk({
      status: result.status,
      item: {
        id: result.dress.id,
        name: result.dress.name,
        category: result.dress.category,
        size: result.dress.size || "",
        color: result.dress.color || "",
        photo: result.dress.thumbnailUrl || result.dress.photoUrl || "",
      },
      free_quantity: result.free_quantity,
      total_quantity: result.total_quantity,
      blockingRecords: result.blockingRecords,
      warningRecords: result.warningRecords,
    });
  } catch (e) {
    if (e instanceof ScannedDressAvailabilityError) return jsonError(e.message, 400);
    if (e instanceof InventoryScanCodeError) return jsonError(e.message, 400);
    throw e;
  }
}
