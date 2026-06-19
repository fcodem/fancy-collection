import prisma from "@/lib/prisma";
import { jsonOk, requireUser, isResponse } from "@/lib/api";

export async function GET() {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const items = await prisma.clothingItem.findMany({
    where: { status: "available" },
    orderBy: { name: "asc" },
  });
  return jsonOk(items.map((i) => ({
    id: i.id,
    name: i.name,
    sku: i.sku,
    daily_rate: i.dailyRate,
    deposit: i.deposit,
  })));
}
