import { exportBookingsCsv } from "@/lib/services/adminOps";
import { requireOwner, isResponse } from "@/lib/api";

export async function GET() {
  const user = await requireOwner();
  if (isResponse(user)) return user;
  const csv = await exportBookingsCsv();
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="bookings_export.csv"',
    },
  });
}
