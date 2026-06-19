import { NextResponse } from "next/server";
import { getCurrentUser, requireOwner } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dressDisplayName, dressNamePrismaFilter } from "@/lib/dress";

export async function GET(request: Request) {
  await getCurrentUser();
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();
  const category = (searchParams.get("category") || "").trim();
  const limit = Math.min(parseInt(searchParams.get("limit") || "12", 10), 30);
  if (!q) return NextResponse.json([]);

  const where = {
    ...dressNamePrismaFilter(q),
    ...(category ? { category } : {}),
  };

  const items = await prisma.clothingItem.findMany({
    where,
    take: limit,
    orderBy: [{ name: "asc" }, { size: "asc" }],
  });

  return NextResponse.json(
    items.map((i) => ({
      id: i.id,
      name: i.name,
      display_name: dressDisplayName(i.name, i.category, i.size),
      sku: i.sku,
      category: i.category,
      size: i.size || "",
      color: i.color || "",
    }))
  );
}
