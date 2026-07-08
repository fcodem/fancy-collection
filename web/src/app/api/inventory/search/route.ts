import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { dressDisplayName } from "@/lib/dress";
import { buildDressSearchWhere } from "@/lib/dress";
import { jsonOk, requireUser, isResponse } from "@/lib/api";
import { catalogPhotoRef } from "@/lib/catalogPhotoRef";

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (isResponse(user)) return user;

  const q = req.nextUrl.searchParams.get("q")?.trim() || "";
  const category = req.nextUrl.searchParams.get("category")?.trim() || "";
  if (!q) return jsonOk({ category_results: [], other_results: [], used_fallback: false, category });

  const where = buildDressSearchWhere(q);
  const serialize = (items: Awaited<ReturnType<typeof prisma.clothingItem.findMany>>) =>
    items.map((i) => ({
      id: i.id,
      name: i.name,
      display_name: dressDisplayName(i.name, i.category, i.size),
      sku: i.sku,
      category: i.category,
      size: i.size,
      color: i.color,
      status: i.status,
      photo: catalogPhotoRef(i),
      sub_category: i.subCategory,
      daily_rate: i.dailyRate,
      deposit: i.deposit,
    }));

  let categoryResults = category
    ? await prisma.clothingItem.findMany({ where: { ...where, category }, take: 50, orderBy: { name: "asc" } })
    : [];

  if (category && !categoryResults.length) {
    const otherResults = await prisma.clothingItem.findMany({ where, take: 50, orderBy: { name: "asc" } });
    return jsonOk({
      category_results: [],
      other_results: serialize(otherResults),
      used_fallback: true,
      category,
    });
  }

  if (!category) {
    categoryResults = await prisma.clothingItem.findMany({ where, take: 50, orderBy: { name: "asc" } });
  }

  return jsonOk({
    category_results: serialize(categoryResults),
    other_results: [],
    used_fallback: false,
    category,
  });
}
