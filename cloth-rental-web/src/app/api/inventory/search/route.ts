import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dressDisplayName, dressNamePrismaFilter } from "@/lib/dress";

export async function GET(request: Request) {
  await getCurrentUser();
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();
  const category = (searchParams.get("category") || "").trim();
  if (!q) {
    return NextResponse.json({ category_results: [], other_results: [], used_fallback: false, category });
  }

  const baseWhere = dressNamePrismaFilter(q) || {};
  const catWhere = category ? { ...baseWhere, category } : baseWhere;
  const categoryResults = await prisma.clothingItem.findMany({
    where: catWhere,
    take: 40,
    orderBy: { name: "asc" },
  });

  let otherResults: typeof categoryResults = [];
  let usedFallback = false;
  if (category && categoryResults.length === 0) {
    usedFallback = true;
    otherResults = await prisma.clothingItem.findMany({
      where: baseWhere,
      take: 40,
      orderBy: { name: "asc" },
    });
  }

  const serialize = (items: typeof categoryResults) =>
    items.map((i) => ({
      id: i.id,
      name: i.name,
      display_name: dressDisplayName(i.name, i.category, i.size),
      sku: i.sku,
      category: i.category,
      size: i.size || "",
      color: i.color || "",
      status: i.status,
      photo: i.photo || "",
      sub_category: i.subCategory || "",
    }));

  return NextResponse.json({
    category_results: serialize(categoryResults),
    other_results: serialize(otherResults),
    used_fallback: usedFallback,
    category,
  });
}
