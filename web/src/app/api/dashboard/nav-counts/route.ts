import prisma from "@/lib/prisma";
import { jsonOk, jsonError } from "@/lib/api";
import { getCurrentUserReadOnly } from "@/lib/auth";
import { localTodayStart } from "@/lib/constants";

export async function GET() {
  const user = await getCurrentUserReadOnly();
  if (!user) return jsonError("Please log in to continue.", 401);

  const today = localTodayStart();
  const overdueDeliveryCount = await prisma.booking.count({
    where: { deliveryDate: { lt: today }, status: "booked" },
  });
  return jsonOk({ overdue_delivery_count: overdueDeliveryCount });
}
