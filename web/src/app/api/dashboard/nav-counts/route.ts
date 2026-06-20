import prisma, { todayStartQ } from "@/lib/prisma";
import { jsonOk, jsonError } from "@/lib/api";
import { getCurrentUserReadOnly } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUserReadOnly();
  if (!user) return jsonError("Please log in to continue.", 401);

  const today = todayStartQ();
  const overdueDeliveryCount = await prisma.booking.count({
    where: { deliveryDate: { lt: today }, status: "booked" },
  });
  return jsonOk({ overdue_delivery_count: overdueDeliveryCount });
}
