import prisma from "@/lib/prisma";
import { jsonOk, jsonError } from "@/lib/api";
import { getCurrentUserReadOnly } from "@/lib/auth";
import { todayIso } from "@/lib/constants";
import { whereOverduePendingDelivery } from "@/lib/bookingDateQuery";

export async function GET() {
  const user = await getCurrentUserReadOnly();
  if (!user) return jsonError("Please log in to continue.", 401);

  const overdueDeliveryCount = await prisma.booking.count({
    where: await whereOverduePendingDelivery(todayIso()),
  });
  return jsonOk({ overdue_delivery_count: overdueDeliveryCount });
}
