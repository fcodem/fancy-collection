import { getRecycleBin } from "@/lib/services/operations";
import { serializeBookingForList } from "@/lib/booking";
import { jsonOk, requireUser, isResponse } from "@/lib/api";

export async function GET() {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const bookings = await getRecycleBin();
  return jsonOk(bookings.map((b) => serializeBookingForList(b)));
}
